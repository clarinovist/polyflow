import { Type, type TSchema } from '@earendil-works/pi-ai';
import { z } from 'zod';
import {
    defineExtension,
    defineTool,
    hook,
    ToolTask,
    type Extension,
    type ToolExecutionResult,
} from '@earendil-works/pi-durable';
import type { Context } from '@earendil-works/chord';
import type {
    ConversationDocToken,
    ConversationId,
    JsonObject,
} from '@earendil-works/pi-durable';
import type { AssistantToolDefinition, ToolEvidence } from '../assistant-types';
import type { AssistantBrokerClient } from './broker-client';
import { evidenceToText } from '../evidence';
import { checkToolAuthorization } from '../tool-authorization';
import { getToolByName, toolRegistry } from '../tool-registry';
import { assertBoundAuthority, withBoundAuthority } from './authority';
import { AuthorityDoc, type ToolEvidenceDetail } from './documents';
import {
    getProposalToolByName,
    proposalToolRegistry,
    type AssistantProposalToolDefinition,
} from './proposal-tools';

/**
 * Worker-side view of a proposal tool: schema and metadata only. It can never
 * run locally; execution exists only inside the broker, so a missing broker
 * fails closed instead of writing from the worker.
 */
function proposalToolForWorker(
    tool: AssistantProposalToolDefinition,
): AssistantToolDefinition {
    return {
        name: tool.name,
        description: tool.description,
        requiredResources: tool.requiredResources,
        sensitivity: tool.sensitivity,
        inputSchema: tool.inputSchema,
        execute: async () => {
            throw new Error('ASSISTANT_PROPOSAL_REQUIRES_BROKER');
        },
    };
}

function getRegisteredTool(name: string): AssistantToolDefinition | undefined {
    const readOnly = getToolByName(name);
    if (readOnly) return readOnly;
    const proposal = getProposalToolByName(name);
    return proposal ? proposalToolForWorker(proposal) : undefined;
}

export function zodToTypeBox(tool: AssistantToolDefinition): TSchema {
    // Zod 4 emits standards-compliant JSON Schema. Type.Unsafe preserves the
    // schema at the Pi boundary; execute() still performs authoritative Zod
    // safeParse so unsupported conversions fail closed instead of widening.
    return Type.Unsafe(z.toJSONSchema(tool.inputSchema));
}

function executionKey(conversationId: number, taskId: number, callId: string) {
    return `${conversationId}:${taskId}:${callId}`;
}

export type DurableAssistantToolOptions = {
    broker?: {
        client: Pick<AssistantBrokerClient, 'execute'>;
        toolNames: ReadonlySet<string>;
    };
    callbacks?: {
        onResult?: (input: {
            authority: Awaited<ReturnType<typeof currentAuthority>>;
            executionKey: string;
            taskId: string;
            callId: string;
            tool: AssistantToolDefinition;
            evidence?: ToolEvidence;
            allowed: boolean;
            outcome: 'SUCCESS' | 'ERROR' | 'DENIED';
            durationMs: number;
        }) => Promise<void>;
    };
};

export async function executeAssistantToolCall(input: {
    freshTool: AssistantToolDefinition;
    args: unknown;
    authority: Awaited<ReturnType<typeof currentAuthority>>;
    assistantContext?: Parameters<typeof checkToolAuthorization>[1];
    executionKey: string;
    taskId: string;
    callId: string;
    broker?: DurableAssistantToolOptions['broker'];
}): Promise<ToolEvidence> {
    const parsed = input.freshTool.inputSchema.safeParse(input.args);
    if (!parsed.success) throw new Error('ASSISTANT_TOOL_INPUT_INVALID');
    if (input.broker?.toolNames.has(input.freshTool.name)) {
        return input.broker.client.execute({
            protocolVersion: 1,
            authority: input.authority,
            executionKey: input.executionKey,
            taskId: input.taskId,
            callId: input.callId,
            toolName: input.freshTool.name,
            arguments: parsed.data as Record<string, unknown>,
        });
    }
    if (!input.assistantContext) throw new Error('ASSISTANT_CONTEXT_MISSING');
    return Promise.race([
        input.freshTool.execute(parsed.data, input.assistantContext),
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error('ASSISTANT_TOOL_TIMEOUT')),
                15_000,
            ),
        ),
    ]);
}

async function currentAuthority(
    api: {
        conversationId: ConversationId;
        snapshot<T extends JsonObject>(
            token: ConversationDocToken<T>,
            conversationId: ConversationId,
            context: Context,
        ): Promise<Readonly<T> | undefined>;
    },
    context: Context,
) {
    const authority = await api.snapshot(
        AuthorityDoc,
        api.conversationId,
        context,
    );
    if (!authority?.publicConversationId)
        throw new Error('ASSISTANT_AUTHORITY_MISSING');
    return authority;
}

function createDurableAssistantTool(
    tool: AssistantToolDefinition,
    options: DurableAssistantToolOptions = {},
) {
    // Replay classification (plan §2.4): every curated registry tool is a
    // bound-parameterised SELECT (or SELECT + published-KB read) with no
    // INSERT/UPDATE/DELETE path. Audit/projection writes use stable
    // execution keys via upsert, so re-execution after a crash cannot
    // duplicate rows. Verified read-only 2026-10-03; any future tool with a
    // mutation, external transport, or unproven semantics must be registered
    // with replay:'unsafe' and excluded from this curated extension.
    return defineTool({
        name: tool.name,
        description: tool.description,
        parameters: zodToTypeBox(tool),
        replay: 'safe' as const,
        executionMode: 'sequential' as const,
        outputLimits: {
            maxBytes: 32_000,
            maxLines: 500,
            retain: 'head' as const,
        },
        execute: async (
            args,
            api,
            context,
        ): Promise<ToolExecutionResult<ToolEvidenceDetail>> => {
            const authority = await currentAuthority(api, context);
            const key = executionKey(
                Number(api.conversationId),
                Number(api.taskId),
                api.callId,
            );
            if (options.broker?.toolNames.has(tool.name)) {
                const freshTool = getRegisteredTool(tool.name);
                if (!freshTool)
                    throw new Error('ASSISTANT_TOOL_NOT_REGISTERED');
                const parsed = freshTool.inputSchema.safeParse(args);
                if (!parsed.success) {
                    return {
                        isError: true,
                        content: [
                            { type: 'text', text: 'Input tool tidak valid.' },
                        ],
                        details: {
                            authorization: 'denied',
                            executionKey: key,
                            evidence: null,
                        },
                    };
                }
                const evidence = await executeAssistantToolCall({
                    freshTool,
                    args: parsed.data,
                    authority,
                    executionKey: key,
                    taskId: String(api.taskId),
                    callId: api.callId,
                    broker: options.broker,
                });
                return {
                    content: [{ type: 'text', text: evidenceToText(evidence) }],
                    details: {
                        authorization: 'allowed',
                        executionKey: key,
                        evidence: JSON.parse(
                            JSON.stringify(evidence),
                        ) as ToolEvidence & JsonObject,
                    },
                };
            }
            return withBoundAuthority(
                authority,
                async ({ assistantContext }) => {
                    const startedAt = Date.now();
                    const report = async (
                        allowed: boolean,
                        outcome: 'SUCCESS' | 'ERROR' | 'DENIED',
                        evidence?: ToolEvidence,
                    ) =>
                        options.callbacks?.onResult?.({
                            authority,
                            executionKey: key,
                            taskId: String(api.taskId),
                            callId: api.callId,
                            tool,
                            evidence,
                            allowed,
                            outcome,
                            durationMs: Date.now() - startedAt,
                        });
                    const freshTool = getRegisteredTool(tool.name);
                    if (!freshTool)
                        throw new Error('ASSISTANT_TOOL_NOT_REGISTERED');
                    const authorization = checkToolAuthorization(
                        freshTool,
                        assistantContext,
                    );
                    if (!authorization.allowed) {
                        await report(false, 'DENIED');
                        return {
                            isError: true,
                            content: [
                                {
                                    type: 'text',
                                    text: `Akses ditolak: ${authorization.reason ?? 'permission revoked'}`,
                                },
                            ],
                            details: {
                                authorization: 'denied',
                                executionKey: key,
                                evidence: null,
                            },
                        };
                    }
                    const parsed = freshTool.inputSchema.safeParse(args);
                    if (!parsed.success) {
                        return {
                            isError: true,
                            content: [
                                {
                                    type: 'text',
                                    text: 'Input tool tidak valid.',
                                },
                            ],
                            details: {
                                authorization: 'allowed',
                                executionKey: key,
                                evidence: null,
                            },
                        };
                    }
                    let evidence: ToolEvidence;
                    try {
                        evidence = await executeAssistantToolCall({
                            freshTool,
                            args: parsed.data,
                            authority,
                            assistantContext,
                            executionKey: key,
                            taskId: String(api.taskId),
                            callId: api.callId,
                            broker: options.broker,
                        });
                    } catch (error) {
                        await report(true, 'ERROR');
                        throw error;
                    }
                    await report(true, 'SUCCESS', evidence);
                    return {
                        content: [
                            { type: 'text', text: evidenceToText(evidence) },
                        ],
                        details: {
                            authorization: 'allowed',
                            executionKey: key,
                            evidence: JSON.parse(
                                JSON.stringify(evidence),
                            ) as ToolEvidence & JsonObject,
                        },
                    };
                },
            );
        },
    });
}

export function createPolyflowReadOnlyTools(
    options: DurableAssistantToolOptions = {},
): Extension {
    // Proposal tools are exposed only when the broker is configured to run
    // them. Their creation is replay-safe: the broker claims the execution key
    // and the proposal upsert is keyed by conversation + payload digest.
    const proposalTools = proposalToolRegistry
        .filter((tool) => options.broker?.toolNames.has(tool.name))
        .map(proposalToolForWorker);
    const tools = [...toolRegistry, ...proposalTools].map((tool) =>
        createDurableAssistantTool(tool, options),
    );
    const durableToolNames = new Set(tools.map((tool) => tool.name));
    return defineExtension({
        name: 'polyflow-read-only-tools',
        tools,
        hooks: [
            hook(ToolTask, {
                beforeTool: async (call, api, context) => {
                    if (!durableToolNames.has(call.name)) {
                        return {
                            block: 'Tool is not in the curated Polyflow read-only registry.',
                        };
                    }
                    const authority = await currentAuthority(api, context);
                    const tool = getRegisteredTool(call.name);
                    if (!tool) return { block: 'Tool is not registered.' };
                    if (options.broker?.toolNames.has(call.name)) {
                        // Broker performs authoritative live rebinding so stale
                        // authority denials can be audited at the only DB writer.
                        return undefined;
                    }
                    const verified = await assertBoundAuthority(authority);
                    const authorization = checkToolAuthorization(
                        tool,
                        verified.assistantContext,
                    );
                    return authorization.allowed
                        ? undefined
                        : {
                              block:
                                  authorization.reason ?? 'Permission denied.',
                          };
                },
            }),
        ],
    });
}
