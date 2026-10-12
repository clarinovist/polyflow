import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
    DurableAdmissionLocks,
    reserveDurableAdmission,
} from '../admission';

const authority = {
    schemaVersion: 1 as const,
    publicConversationId: 'public-conversation',
    tenantId: 'tenant-one',
    userId: 'user-one',
    channel: 'web' as const,
    accessScopeHash: 'a'.repeat(64),
    workContextKey: 'general:/',
    pathname: '/',
    profile: 'general' as const,
};
const envelope = {
    protocolVersion: 1 as const,
    requestId: '22222222-2222-4222-8222-222222222222',
    tenantId: 'tenant-one',
    userId: 'user-one',
    channel: 'web' as const,
    question: 'halo',
    workContext: { pathname: '/' },
};

function binding(overrides: Record<string, unknown> = {}) {
    return {
        id: 'binding-1',
        publicConversationId: authority.publicConversationId,
        tenantId: authority.tenantId,
        userId: authority.userId,
        channel: authority.channel,
        accessScopeHash: authority.accessScopeHash,
        workContextKey: authority.workContextKey,
        storageKey: createHash('sha256')
            .update(authority.tenantId)
            .digest('hex'),
        durableConversationId: '7',
        storageVersion: 1,
        pathname: '/',
        profile: 'general',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

function reservation(overrides: Record<string, unknown> = {}) {
    return {
        id: 'reservation-1',
        requestId: envelope.requestId,
        questionHash: createHash('sha256')
            .update(envelope.question)
            .digest('hex'),
        publicConversationId: authority.publicConversationId,
        tenantId: authority.tenantId,
        userId: authority.userId,
        channel: authority.channel,
        durableSubmissionId: null,
        durableConversationId: null,
        status: 'pending',
        attempts: 1,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

function database(input?: {
    existingBinding?: ReturnType<typeof binding> | null;
    existingReservation?: ReturnType<typeof reservation> | null;
}) {
    const order: string[] = [];
    const bindingValue = input?.existingBinding ?? null;
    const reservationValue = input?.existingReservation ?? null;
    const transaction = {
        assistantDurableBinding: {
            findUnique: vi.fn(async () => bindingValue),
            create: vi.fn(async () => {
                order.push('binding');
                return binding();
            }),
        },
        assistantDurableSubmission: {
            findUnique: vi.fn(async () => reservationValue),
            create: vi.fn(async () => {
                order.push('reservation');
                return reservation();
            }),
            update: vi.fn(async () =>
                reservation({ attempts: (reservationValue?.attempts ?? 1) + 1 }),
            ),
        },
    };
    return {
        order,
        transaction,
        client: {
            $transaction: vi.fn(
                async (operation: (tx: typeof transaction) => Promise<unknown>) =>
                    operation(transaction),
            ),
        },
    };
}

const admissionInput = {
    envelope,
    authority,
    questionHash: createHash('sha256')
        .update(envelope.question)
        .digest('hex'),
    durableConversationId: '7',
};

describe('durable admission transaction', () => {
    it('creates the binding parent before the reservation child', async () => {
        const fixture = database();
        const result = await reserveDurableAdmission({
            ...admissionInput,
            database: fixture.client as never,
        });
        expect(fixture.order).toEqual(['binding', 'reservation']);
        expect(result.binding.durableConversationId).toBe('7');
        expect(result.reservation.status).toBe('pending');
    });

    it('treats an existing binding as immutable', async () => {
        const fixture = database({
            existingBinding: binding({ durableConversationId: '999' }),
        });
        await expect(
            reserveDurableAdmission({
                ...admissionInput,
                database: fixture.client as never,
            }),
        ).rejects.toMatchObject({ code: 'CONTEXT_MISMATCH', status: 409 });
        expect(
            fixture.transaction.assistantDurableSubmission.create,
        ).not.toHaveBeenCalled();
    });

    it('rejects a requestId reused for another question', async () => {
        const fixture = database({
            existingBinding: binding(),
            existingReservation: reservation({ questionHash: 'b'.repeat(64) }),
        });
        await expect(
            reserveDurableAdmission({
                ...admissionInput,
                database: fixture.client as never,
            }),
        ).rejects.toMatchObject({ code: 'CONTEXT_MISMATCH', status: 409 });
    });
});

describe('durable admission locks', () => {
    it('serializes the same key and removes the lock after success', async () => {
        const locks = new DurableAdmissionLocks();
        const events: string[] = [];
        let release!: () => void;
        const firstGate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const first = locks.run('same', async () => {
            events.push('first-start');
            await firstGate;
            events.push('first-end');
        });
        const second = locks.run('same', async () => {
            events.push('second');
        });
        await vi.waitFor(() => {
            expect(events).toEqual(['first-start']);
        });
        release();
        await Promise.all([first, second]);
        expect(events).toEqual(['first-start', 'first-end', 'second']);
        expect(locks.size).toBe(0);
    });

    it('removes the lock after an operation throws', async () => {
        const locks = new DurableAdmissionLocks();
        await expect(
            locks.run('failed', async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');
        expect(locks.size).toBe(0);
    });
});
