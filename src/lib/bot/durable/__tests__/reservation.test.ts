import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

const submissionStore = new Map<string, TestRow>();

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
    createdAt: Date;
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

const main = {
    tenant: { findFirst: vi.fn() },
    tenantModule: { findMany: vi.fn() },
    assistantDurableBinding: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
    },
    assistantDurableSubmission: {
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
        create: vi.fn(async (args: { data: Omit<TestRow, 'id' | 'createdAt'> }) => {
            const key = rowKey(args.data);
            if (submissionStore.has(key)) {
                const error = new Error('Unique constraint failed');
                (error as { code?: string }).code = 'P2002';
                throw error;
            }
            const row: TestRow = {
                ...args.data,
                id: `row-${submissionStore.size + 1}`,
                attempts: args.data.attempts ?? 1,
                createdAt: new Date('2026-10-03T00:00:00Z'),
            };
            submissionStore.set(key, row);
            return row;
        }),
        update: vi.fn(
            async (args: { where: { id: string }; data: { attempts?: { increment: number } } }) => {
                const row = [...submissionStore.values()].find(
                    (item) => item.id === args.where.id,
                );
                if (!row) throw new Error('NOT_FOUND');
                if (args.data.attempts)
                    row.attempts += args.data.attempts.increment;
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
                    row.publicConversationId !==
                        args.where.publicConversationId
                )
                    return { count: 0 };
                Object.assign(row, args.data);
                return { count: 1 };
            },
        ),
    },
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
vi.mock('../authority', async (importOriginal) => {
    const original =
        await importOriginal<typeof import('../authority')>();
    return {
        ...original,
        saveDurableBinding: vi.fn(async () => undefined),
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
    existingByRequest.clear();
    submissionById.clear();
    nextSubmissionId = 100;
    vi.clearAllMocks();
    main.assistantDurableBinding.findUnique.mockResolvedValue({
        publicConversationId: 'public-conversation',
        durableConversationId: '7',
    });
});

describe('durable submission reservation (crash-safe admission)', () => {
    it('reserves pending before admission and fills durable IDs after', async () => {
        const snapshot = await runtime.submit(envelope());
        expect(snapshot.status).toBe('queued');
        const stored = submissionStore.get(
            'tenant-one:user-one:web:' + REQUEST_ID,
        );
        expect(stored?.status).toBe('queued');
        expect(stored?.durableSubmissionId).toBe('100');
        expect(stored?.durableConversationId).toBe('7');
        expect(conversation.submit).toHaveBeenCalledTimes(1);
    });

    it('retry on the same requestId reuses the single submission, never admits twice', async () => {
        await runtime.submit(envelope());
        // Simulate a crash after admission but before observing: the SQLite
        // submission survives, the PG row is filled. Retry must dedupe.
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

    it('reconciles a pending reservation with an already-admitted SQLite submission', async () => {
        // Crash window: PG row reserved (pending, no durable IDs) but the
        // process died before/while admitting; SQLite actually admitted id 55.
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
            createdAt: new Date('2026-10-03T00:00:00Z'),
        };
        submissionStore.set('tenant-one:user-one:web:' + REQUEST_ID, pending);
        existingByRequest.set(REQUEST_ID, { id: 55 });
        submissionById.set(55, { knownRequestId: REQUEST_ID });

        const retry = await runtime.submit(envelope());
        expect(retry.status).toBe('queued');
        // No second admission: the reconciled SQLite submission is reused.
        expect(conversation.submit).not.toHaveBeenCalled();
        expect(pending.durableSubmissionId).toBe('55');
        expect(pending.status).toBe('queued');
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
});
