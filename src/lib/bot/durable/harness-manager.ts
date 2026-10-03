import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import {
    createRegistry,
    Harness,
    type Conversation,
    type Harness as HarnessInstance,
    type Extension,
} from '@earendil-works/pi-durable';
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node';
import type { Models } from '@earendil-works/pi-ai';
import type { AssistantAuthority } from './protocol';
import { AuthorityDoc } from './documents';
import { PolyflowPolicy } from './prompt';
import { PolyflowFastPath } from './fast-path';
import { GenerationTask, hook } from '@earendil-works/pi-durable';
import { createPolyflowReadOnlyTools } from './tool-adapter';
import { upsertDurableToolAudit } from './projection';

const MAX_AGENT_TURNS = 4;

function defineTurnLimit(): Extension {
    return {
        name: 'polyflow-turn-limit',
        hooks: [
            hook(GenerationTask, {
                beforeRequest: async (request) => {
                    const activeUserIndex = request.messages.findLastIndex(
                        (message) => message.role === 'user',
                    );
                    const turns = request.messages
                        .slice(activeUserIndex + 1)
                        .filter(
                            (message) => message.role === 'assistant',
                        ).length;
                    if (turns >= MAX_AGENT_TURNS) {
                        throw new Error('ASSISTANT_TURN_LIMIT');
                    }
                    return { messages: request.messages };
                },
            }),
        ],
    };
}

export type HarnessLease = {
    harness: HarnessInstance;
    conversation: Conversation;
    tools: Extension;
    release(): void;
};

type ManagedHarness = {
    harness: HarnessInstance;
    tools: Extension;
    turnLimit: Extension;
    lastUsedAt: number;
    leases: number;
    close?: Promise<void>;
};

export class TenantHarnessManager {
    private readonly opened = new Map<string, ManagedHarness>();
    private readonly opening = new Map<string, Promise<ManagedHarness>>();
    private closing = false;

    constructor(
        private readonly options: {
            root: string;
            models: Models;
            model: { provider: string; modelId: string };
            maxOpen: number;
            idleMs: number;
            onReport?: (error: unknown) => void;
        },
    ) {}

    storageKey(tenantId: string): string {
        return createHash('sha256').update(tenantId).digest('hex');
    }

    storagePath(tenantId: string): string {
        const key = this.storageKey(tenantId);
        const candidate = path.resolve(
            this.options.root,
            key,
            'assistant.sqlite',
        );
        const root = `${path.resolve(this.options.root)}${path.sep}`;
        if (!candidate.startsWith(root))
            throw new Error('INVALID_ASSISTANT_STORAGE_PATH');
        return candidate;
    }

    async acquire(
        authority: AssistantAuthority,
        durableConversationId?: number,
    ): Promise<HarnessLease> {
        if (this.closing) throw new Error('ASSISTANT_MANAGER_CLOSING');
        const key = this.storageKey(authority.tenantId);
        const managed = await this.getOrOpen(authority.tenantId, key);
        managed.leases++;
        managed.lastUsedAt = Date.now();
        void this.evictIdle();
        try {
            let conversation = durableConversationId
                ? await managed.harness.conversation(
                      durableConversationId as never,
                      BACKGROUND_CONTEXT,
                  )
                : undefined;
            if (durableConversationId && !conversation) {
                throw new Error('ASSISTANT_DURABLE_CONVERSATION_NOT_FOUND');
            }
            if (!conversation) {
                conversation = await managed.harness.createConversation(
                    {
                        ownership: { kind: 'ownerless' },
                        agent: {
                            model: this.options.model,
                            thinkingLevel: 'off',
                            extensions: [
                                PolyflowPolicy,
                                managed.tools,
                                managed.turnLimit,
                                PolyflowFastPath,
                            ],
                        },
                        init: async (tx, conversationId) => {
                            Object.assign(
                                await tx.doc(AuthorityDoc, conversationId),
                                authority,
                            );
                        },
                    },
                    BACKGROUND_CONTEXT,
                );
            } else {
                const stored = await managed.harness.snapshot(
                    AuthorityDoc,
                    conversation.id,
                    BACKGROUND_CONTEXT,
                );
                if (
                    !stored ||
                    stored.tenantId !== authority.tenantId ||
                    stored.userId !== authority.userId ||
                    stored.publicConversationId !==
                        authority.publicConversationId ||
                    stored.channel !== authority.channel ||
                    stored.accessScopeHash !== authority.accessScopeHash ||
                    stored.workContextKey !== authority.workContextKey
                ) {
                    throw new Error('ASSISTANT_DURABLE_AUTHORITY_MISMATCH');
                }
            }
            let released = false;
            return {
                harness: managed.harness,
                conversation,
                tools: managed.tools,
                release: () => {
                    if (released) return;
                    released = true;
                    managed.leases--;
                    managed.lastUsedAt = Date.now();
                    void this.evictIdle();
                },
            };
        } catch (error) {
            managed.leases--;
            throw error;
        }
    }

    async inspect(): Promise<{
        ready: boolean;
        openHarnesses: number;
        blockedTasks: number;
    }> {
        let blockedTasks = 0;
        for (const managed of this.opened.values()) {
            const inspection =
                await managed.harness.inspect(BACKGROUND_CONTEXT);
            blockedTasks += inspection.tasks.filter(
                (task) => task.state.kind === 'blocked',
            ).length;
        }
        return {
            ready: !this.closing && blockedTasks === 0,
            openHarnesses: this.opened.size,
            blockedTasks,
        };
    }

    async close(): Promise<void> {
        this.closing = true;
        await Promise.allSettled([...this.opening.values()]);
        await Promise.all(
            [...this.opened.entries()].map(([key, managed]) =>
                this.closeManaged(key, managed),
            ),
        );
    }

    async evictIdle(now = Date.now()): Promise<void> {
        const candidates = [...this.opened.entries()]
            .filter(([, item]) => item.leases === 0 && !item.close)
            .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
        for (const [key, managed] of candidates) {
            if (
                this.opened.size <= this.options.maxOpen &&
                now - managed.lastUsedAt < this.options.idleMs
            )
                break;
            const inspection =
                await managed.harness.inspect(BACKGROUND_CONTEXT);
            if (
                inspection.tasks.length > 0 ||
                inspection.submissions.length > 0
            )
                continue;
            await this.closeManaged(key, managed);
        }
    }

    private async getOrOpen(
        tenantId: string,
        key: string,
    ): Promise<ManagedHarness> {
        const existing = this.opened.get(key);
        if (existing && !existing.close) return existing;
        const inFlight = this.opening.get(key);
        if (inFlight) return inFlight;
        const opening = this.open(tenantId, key);
        this.opening.set(key, opening);
        try {
            return await opening;
        } finally {
            this.opening.delete(key);
        }
    }

    private async open(tenantId: string, key: string): Promise<ManagedHarness> {
        const file = this.storagePath(tenantId);
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        const registry = createRegistry();
        registry.install(PolyflowPolicy);
        registry.install(PolyflowFastPath);
        const tools = createPolyflowReadOnlyTools({
            onResult: async (result) => {
                await upsertDurableToolAudit({
                    authority: result.authority,
                    executionKey: result.executionKey,
                    taskId: result.taskId,
                    callId: result.callId,
                    toolName: result.tool.name,
                    permissionResource: result.tool.requiredResources.join(','),
                    evidence: result.evidence,
                    allowed: result.allowed,
                    outcome: result.outcome,
                    durationMs: result.durationMs,
                });
            },
        });
        registry.install(tools);
        const turnLimit = defineTurnLimit();
        registry.install(turnLimit);
        const harness = await Harness.open(
            await openNodeSqliteStorage(file),
            {
                models: this.options.models,
                registry,
                settings: {
                    extensions: [
                        PolyflowPolicy,
                        tools,
                        turnLimit,
                        PolyflowFastPath,
                    ],
                    toolExecution: 'sequential',
                    followUpMode: 'one-at-a-time',
                    compaction: {
                        enabled: true,
                        reserveTokens: 16_384,
                        keepRecentTokens: 20_000,
                        backgroundTokens: 8_192,
                    },
                    stream: { timeoutMs: 120_000, maxRetries: 1 },
                    retry: { maxRetries: 2 },
                },
                onReport: this.options.onReport,
            },
            BACKGROUND_CONTEXT,
        );
        const managed = {
            harness,
            tools,
            turnLimit,
            leases: 0,
            lastUsedAt: Date.now(),
        };
        this.opened.set(key, managed);
        harness.resume();
        return managed;
    }

    private async closeManaged(key: string, managed: ManagedHarness) {
        managed.close ??= managed.harness.close(BACKGROUND_CONTEXT);
        await managed.close;
        if (this.opened.get(key) === managed) this.opened.delete(key);
    }
}
