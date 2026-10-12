import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

const submissionStore = new Map<string, TestRow>();
const bindingStore = new Map<string, TestBinding>();
const operationOrder: string[] = [];

type TestBinding = {
    id: string;
    publicConversationId: string;
    tenantId: string;
    userId: string;
    channel: string;
    accessScopeHash: string;
    workContextKey: string;
    storageKey: string;
    durableConversationId: string;
    storageVersion: number;
    pathname: string;
    profile: string;
    createdAt: Date;
    updatedAt: Date;
};

type TestRow = {
    id: string;
    requestId: string;
    questionHash: string;
    publicConversationId: string;
    tenantId: string;
    userId: string;
    channel: string;
    durableSubmissionId: string | null;
    durableConversationId: string | null;
    status: string;
    attempts: number;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
};

function rowKey(input: {
    tenantId: string;
    userId: string;
    channel: string;
    requestId: string;
}) {
    return `${input.tenantId}:${input.userId}:${input.channel}:${input.requestId}`;
}

function hashQuestion(question: string) {
    return createHash('sha256').update(question).digest('hex');
}

const assistantDurableBinding = {
    findFirst: vi.fn(),
    findUnique: vi.fn(
        async (args: { where: { publicConversationId: string } }) =>
            bindingStore.get(args.where.publicConversationId) ?? null,
    ),
    create: vi.fn(async (args: { data: Omit<TestBinding, 'id' | 'createdAt' | 'updatedAt'> }) => {
        operationOrder.push('binding.create');
        if (bindingStore.has(args.data.publicConversationId)) {
            const error = new Error('Unique constraint failed');
            (error as { code?: string }).code = 'P2002';
            throw error;
        }
        const row: TestBinding = {
            ...args.data,
            id: `binding-${bindingStore.size + 1}`,
            createdAt: new Date('2026-10-03T00:00:00Z'),
            updatedAt: new Date('2026-10-03T00:00:00Z'),
        };
        bindingStore.set(row.publicConversationId, row);
        return row;
    }),
};

const assistantDurableSubmission = {
    findUnique: vi.fn(
        async (args: {
            where: {
                tenantId_userId_channel_requestId: {
                    tenantId: string;
                    userId: string;
                    channel: string;
                    requestId: string;
                };
            };
        }) =>
            submissionStore.get(
                rowKey(args.where.tenantId_userId_channel_requestId),
            ) ?? null,
    ),
    create: vi.fn(
        async (args: {
            data: Omit<TestRow, 'id' | 'createdAt' | 'updatedAt' | 'durableSubmissionId' | 'durableConversationId' | 'lastError'>;
        }) => {
            operationOrder.push('reservation.create');
            if (!bindingStore.has(args.data.publicConversationId)) {
                const error = new Error('Foreign key constraint failed');
                (error as { code?: string }).code = 'P2003';
                throw error;
            }
            const key = rowKey(args.data);
            if (submissionStore.has(key)) {
                const error = new Error('Unique constraint failed');
                (error as { code?: string }).code = 'P2002';
                throw error;
            }
            const row: TestRow = {
                ...args.data,
                id: `row-${submissionStore.size + 1}`,
                durableSubmissionId: null,
                durableConversationId: null,
                lastError: null,
                createdAt: new Date('2026-10-03T00:00:00Z'),
                updatedAt: new Date('2026-10-03T00:00:00Z'),
            };
            submissionStore.set(key, row);
            return row;
        },
    ),
    update: vi.fn(
        async (args: {
            where: { id: string };
            data: { attempts?: { increment: number } };
        }) => {
            const row = [...submissionStore.values()].find(
                (item) => item.id === args.where.id,
            );
            if (!row) throw new Error('NOT_FOUND');
            if (args.data.attempts) row.attempts += args.data.attempts.increment;
            return row;
        },
    ),
    updateMany: vi.fn(
        async (args: {
            where: {
                tenantId: string;
                userId: string;
                channel: string;
                requestId: string;
                publicConversationId: string;
            };
            data: Partial<TestRow>;
        }) => {
            const row = submissionStore.get(rowKey(args.where));
            if (
                !row ||
                row.publicConversationId !== args.where.publicConversationId
            )
                return { count: 0 };
            Object.assign(row, args.data);
            return { count: 1 };
        },
    ),
};

const main = {
    tenant: { findFirst: vi.fn() },
    tenantModule: { findMany: vi.fn() },
    assistantDurableBinding,
    assistantDurableSubmission,
    $transaction: vi.fn(
        async (operation: (transaction: object) => Promise<unknown>) =>
            operation({ assistantDurableBinding, assistantDurableSubmission }),
    ),
};

const tenantDb = {
    helpConversation: { findFirst: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    userRole: { findMany: vi.fn() },
    rolePermission: { findMany: vi.fn() },
};

vi.mock('@/lib/core/prisma', async () => {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    const tenantContext = new AsyncLocalStorage<object>();
    const tenantIdContext = new AsyncLocalStorage<string>();
    const entitlementContext = new AsyncLocalStorage<string[]>();
    return {
        getMainPrisma: () => main,
        getTenantDb: () => tenantDb,
        tenantContext,
        tenantIdContext,
        entitlementContext,
        prisma: new Proxy(
            {},
            { get: (_target, key) => tenantContext.getStore()?.[key as never] },
        ),
    };
});
vi.mock('@/lib/core/actor-context', async () => {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    return { actorContext: new AsyncLocalStorage() };
});
vi.mock('../feature-flags', () => ({ isFeatureEnabled: () => true }));

const existingByRequest = new Map<string, { id: number }>();
const submissionById = new Map<number, { knownRequestId: string }>();
let nextSubmissionId = 100;

const harness = {
    submission: vi.fn(async (id: number) => {
        if (!submissionById.has(id)) return undefined;
        return {
            status: vi.fn(async () => ({ status: 'queued' as const })),
        };
    }),
};
const conversation = {
    id: 7 as never,
    configure: vi.fn(async () => undefined),
    commit: vi.fn(
        async (
            change: (tx: {
                submissionByRequest: (
                    conversationId: unknown,
                    requestId: string,
                ) => Promise<{ id: number } | undefined>;
                doc: () => Promise<Record<string, unknown>>;
            }) => Promise<unknown>,
        ) =>
            change({
                submissionByRequest: vi.fn(async (_cid, requestId: string) =>
                    existingByRequest.get(requestId),
                ),
                doc: vi.fn(async () => ({})),
            }),
    ),
    submit: vi.fn(async (draft: { requestId: string }) => {
        const id = nextSubmissionId++;
        existingByRequest.set(draft.requestId, { id });
        submissionById.set(id, { knownRequestId: draft.requestId });
        return { id };
    }),
};
const manager = {
    acquire: vi.fn(async () => ({
        harness,
        conversation,
        tools: { tools: [] },
        release: vi.fn(),
    })),
};

vi.mock('../assistant-jev', () => ({
    isAssistantJevEnabled: () => false,
    evaluateAssistantPreflight: vi.fn(),
}));
vi.mock('../assistant-intent', () => ({
    detectAssistantIntent: () => 'greeting',
}));
vi.mock('../assistant-tool-access', () => ({
    getAvailableAssistantTools: () => [],
}));
vi.mock('../fast-path', () => ({
    evaluateDurableFastPath: vi.fn(async () => undefined),
    submitDurableFastPath: vi.fn(),
}));
vi.mock('../projection', () => ({
    projectDurableSubmission: vi.fn(async () => ({
        answer: 'reconciled final',
        citations: [],
        safety: { allowed: true },
        interactionId: 'interaction-1',
    })),
}));
vi.mock('../authority', async (importOriginal) => {
    const original = await importOriginal<typeof import('../authority')>();
    return {
        ...original,
        verifyDurableAuthority: vi.fn(
            async (input: {
                tenantId: string;
                userId: string;
                channel: 'web';
                publicConversationId?: string;
                workContext: { pathname: string };
            }) => ({
                authority: {
                    schemaVersion: 1 as const,
                    publicConversationId:
                        input.publicConversationId ?? 'public-conversation',
                    tenantId: input.tenantId,
                    userId: input.userId,
                    channel: input.channel,
                    accessScopeHash: 'a'.repeat(64),
                    workContextKey: 'general:/',
                    pathname: '/',
                    profile: 'general' as const,
                },
                assistantContext: {
                    userId: input.userId,
                    roles: [],
                    allowedResources: [],
                    tenantId: input.tenantId,
                    channel: input.channel,
                    locale: 'id',
                } as never,
            }),
        ),
    };
});

import { DurableAssistantRuntime } from '../runtime';

const runtime = new DurableAssistantRuntime(manager as never);

function envelope(overrides?: {
    requestId?: string;
    question?: string;
    publicConversationId?: string;
}) {
    return {
        protocolVersion: 1 as const,
        requestId: overrides?.requestId ?? REQUEST_ID,
        publicConversationId: overrides?.publicConversationId,
        tenantId: 'tenant-one',
        userId: 'user-one',
        channel: 'web' as const,
        question: overrides?.question ?? 'berapa stok tersedia?',
        workContext: { pathname: '/' },
    };
}

beforeEach(() => {
    submissionStore.clear();
    bindingStore.clear();
    operationOrder.length = 0;
    existingByRequest.clear();
    submissionById.clear();
    nextSubmissionId = 100;
    vi.clearAllMocks();
});

describe('durable submission reservation (crash-safe admission)', () => {
    it('creates the binding parent before reserving the child', async () => {
        const snapshot = await runtime.submit(envelope());
        expect(snapshot.status).toBe('queued');
        expect(operationOrder).toEqual([
            'binding.create',
            'reservation.create',
        ]);
        expect(main.$transaction).toHaveBeenCalledTimes(1);
        const stored = submissionStore.get(
            'tenant-one:user-one:web:' + REQUEST_ID,
        );
        expect(stored).toMatchObject({
            status: 'queued',
            durableSubmissionId: '100',
            durableConversationId: '7',
        });
        expect(bindingStore.get('public-conversation')).toMatchObject({
            durableConversationId: '7',
            tenantId: 'tenant-one',
        });
    });

    it('retry on the same requestId reuses the single submission', async () => {
        await runtime.submit(envelope());
        existingByRequest.set(REQUEST_ID, { id: 100 });
        const retry = await runtime.submit(envelope());
        expect(retry.status).toBe('queued');
        expect(conversation.submit).toHaveBeenCalledTimes(1);
        const stored = submissionStore.get(
            'tenant-one:user-one:web:' + REQUEST_ID,
        );
        expect(stored?.durableSubmissionId).toBe('100');
        expect(stored?.attempts).toBe(2);
    });

    it('fails closed when a pending reservation has no parent binding', async () => {
        const pending: TestRow = {
            id: 'row-inconsistent',
            requestId: REQUEST_ID,
            questionHash: hashQuestion('berapa stok tersedia?'),
            publicConversationId: 'public-conversation',
            tenantId: 'tenant-one',
            userId: 'user-one',
            channel: 'web',
            durableSubmissionId: null,
            durableConversationId: null,
            status: 'pending',
            attempts: 1,
            lastError: null,
            createdAt: new Date('2026-10-03T00:00:00Z'),
            updatedAt: new Date('2026-10-03T00:00:00Z'),
        };
        submissionStore.set('tenant-one:user-one:web:' + REQUEST_ID, pending);

        await expect(runtime.submit(envelope())).rejects.toMatchObject({
            code: 'INTERNAL',
            status: 500,
        });
        expect(manager.acquire).not.toHaveBeenCalled();
        expect(conversation.submit).not.toHaveBeenCalled();
    });

    it('reconciles a pending reservation with an admitted SQLite submission', async () => {
        bindingStore.set('public-conversation', {
            id: 'binding-pending',
            publicConversationId: 'public-conversation',
            tenantId: 'tenant-one',
            userId: 'user-one',
            channel: 'web',
            accessScopeHash: 'a'.repeat(64),
            workContextKey: 'general:/',
            storageKey: hashQuestion('tenant-one'),
            durableConversationId: '7',
            storageVersion: 1,
            pathname: '/',
            profile: 'general',
            createdAt: new Date('2026-10-03T00:00:00Z'),
            updatedAt: new Date('2026-10-03T00:00:00Z'),
        });
        const pending: TestRow = {
            id: 'row-pending',
            requestId: REQUEST_ID,
            questionHash: hashQuestion('berapa stok tersedia?'),
            publicConversationId: 'public-conversation',
            tenantId: 'tenant-one',
            userId: 'user-one',
            channel: 'web',
            durableSubmissionId: null,
            durableConversationId: null,
            status: 'pending',
            attempts: 1,
            lastError: null,
            createdAt: new Date('2026-10-03T00:00:00Z'),
            updatedAt: new Date('2026-10-03T00:00:00Z'),
        };
        submissionStore.set('tenant-one:user-one:web:' + REQUEST_ID, pending);
        existingByRequest.set(REQUEST_ID, { id: 55 });
        submissionById.set(55, { knownRequestId: REQUEST_ID });

        const retry = await runtime.submit(envelope());
        expect(retry.status).toBe('queued');
        expect(conversation.submit).not.toHaveBeenCalled();
        expect(pending.durableSubmissionId).toBe('55');
        expect(pending.status).toBe('queued');
    });

    it('persists the terminal status when reconciliation finds a done submission', async () => {
        bindingStore.set('public-conversation', {
            id: 'binding-terminal',
            publicConversationId: 'public-conversation',
            tenantId: 'tenant-one',
            userId: 'user-one',
            channel: 'web',
            accessScopeHash: 'a'.repeat(64),
            workContextKey: 'general:/',
            storageKey: hashQuestion('tenant-one'),
            durableConversationId: '7',
            storageVersion: 1,
            pathname: '/',
            profile: 'general',
            createdAt: new Date('2026-10-03T00:00:00Z'),
            updatedAt: new Date('2026-10-03T00:00:00Z'),
        });
        const pending: TestRow = {
            id: 'row-terminal',
            requestId: REQUEST_ID,
            questionHash: hashQuestion('berapa stok tersedia?'),
            publicConversationId: 'public-conversation',
            tenantId: 'tenant-one',
            userId: 'user-one',
            channel: 'web',
            durableSubmissionId: null,
            durableConversationId: null,
            status: 'pending',
            attempts: 1,
            lastError: null,
            createdAt: new Date('2026-10-03T00:00:00Z'),
            updatedAt: new Date('2026-10-03T00:00:00Z'),
        };
        submissionStore.set('tenant-one:user-one:web:' + REQUEST_ID, pending);
        existingByRequest.set(REQUEST_ID, { id: 55 });
        submissionById.set(55, { knownRequestId: REQUEST_ID });
        harness.submission.mockImplementationOnce(async () => ({
            status: vi.fn(async () => ({
                status: 'done',
                type: 'input',
                entry: 1,
                answer: 2,
            })),
        }));

        const retry = await runtime.submit(envelope());
        expect(retry.status).toBe('done');
        expect(conversation.submit).not.toHaveBeenCalled();
        expect(pending.durableSubmissionId).toBe('55');
        expect(pending.status).toBe('done');
    });

    it('persists the terminal status when reconciliation finds an aborted submission', async () => {
        bindingStore.set('public-conversation', {
            id: 'binding-aborted',
            publicConversationId: 'public-conversation',
            tenantId: 'tenant-one',
            userId: 'user-one',
            channel: 'web',
            accessScopeHash: 'a'.repeat(64),
            workContextKey: 'general:/',
            storageKey: hashQuestion('tenant-one'),
            durableConversationId: '7',
            storageVersion: 1,
            pathname: '/',
            profile: 'general',
            createdAt: new Date('2026-10-03T00:00:00Z'),
            updatedAt: new Date('2026-10-03T00:00:00Z'),
        });
        const pending: TestRow = {
            id: 'row-aborted',
            requestId: REQUEST_ID,
            questionHash: hashQuestion('berapa stok tersedia?'),
            publicConversationId: 'public-conversation',
            tenantId: 'tenant-one',
            userId: 'user-one',
            channel: 'web',
            durableSubmissionId: null,
            durableConversationId: null,
            status: 'pending',
            attempts: 1,
            lastError: null,
            createdAt: new Date('2026-10-03T00:00:00Z'),
            updatedAt: new Date('2026-10-03T00:00:00Z'),
        };
        submissionStore.set('tenant-one:user-one:web:' + REQUEST_ID, pending);
        existingByRequest.set(REQUEST_ID, { id: 56 });
        submissionById.set(56, { knownRequestId: REQUEST_ID });
        harness.submission.mockImplementationOnce(async () => ({
            status: vi.fn(async () => ({
                status: 'unanswered',
                reason: 'aborted',
            })),
        }));

        const retry = await runtime.submit(envelope());
        expect(retry.status).toBe('aborted');
        expect(conversation.submit).not.toHaveBeenCalled();
        expect(pending.durableSubmissionId).toBe('56');
        expect(pending.status).toBe('aborted');
    });

    it('rejects a reused requestId with a different question hash', async () => {
        await runtime.submit(envelope());
        await expect(
            runtime.submit(
                envelope({ question: 'pertanyaan yang sama sekali beda' }),
            ),
        ).rejects.toMatchObject({ code: 'CONTEXT_MISMATCH', status: 409 });
        expect(conversation.submit).toHaveBeenCalledTimes(1);
    });

    it('rejects a reused requestId bound to another conversation', async () => {
        await runtime.submit(
            envelope({ publicConversationId: 'public-conversation' }),
        );
        await expect(
            runtime.submit(
                envelope({ publicConversationId: 'other-conversation' }),
            ),
        ).rejects.toMatchObject({ code: 'CONTEXT_MISMATCH' });
        expect(conversation.submit).toHaveBeenCalledTimes(1);
    });

    it('serializes concurrent first requests without overwriting the binding', async () => {
        const otherRequest = '33333333-3333-4333-8333-333333333333';
        await Promise.all([
            runtime.submit(envelope()),
            runtime.submit(envelope({ requestId: otherRequest })),
        ]);
        expect(bindingStore).toHaveLength(1);
        expect(submissionStore).toHaveLength(2);
        expect(assistantDurableBinding.create).toHaveBeenCalledTimes(1);
    });
});
