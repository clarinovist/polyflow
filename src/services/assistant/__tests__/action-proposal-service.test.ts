import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = {
    assistantActionProposal: {
        updateMany: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
    },
    auditLog: { create: vi.fn() },
};

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        assistantActionProposal: {
            upsert: vi.fn(),
            findFirst: vi.fn(),
            updateMany: vi.fn(),
        },
        $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
}));

vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

vi.mock('../../sales/collection-service', () => ({
    CollectionService: { logCollectionActivity: vi.fn() },
}));

import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { CollectionService } from '../../sales/collection-service';
import {
    PROPOSAL_TTL_MS,
    computeProposalDigest,
    createCollectionFollowupProposal,
    confirmProposal,
    cancelProposal,
} from '../action-proposal-service';

const NOW = new Date('2026-11-05T10:00:00.000Z');
const base = {
    tenantId: 't1',
    userId: 'u1',
    conversationId: 'c1',
    now: NOW,
    assertInvoiceAccess: vi.fn(),
};
const payload = {
    invoiceId: 'inv1',
    type: 'CALL' as const,
    notes: 'telepon bagian keuangan',
};

beforeEach(() => {
    vi.clearAllMocks();
    base.assertInvoiceAccess.mockResolvedValue(undefined);
});

describe('computeProposalDigest', () => {
    it('is stable regardless of key order', () => {
        const a = computeProposalDigest('t1', 'u1', 'K', { a: 1, b: 2 });
        const b = computeProposalDigest('t1', 'u1', 'K', { b: 2, a: 1 });
        expect(a).toBe(b);
    });

    it('changes when tenant, user or payload change', () => {
        const ref = computeProposalDigest('t1', 'u1', 'K', { a: 1 });
        expect(computeProposalDigest('t2', 'u1', 'K', { a: 1 })).not.toBe(ref);
        expect(computeProposalDigest('t1', 'u2', 'K', { a: 1 })).not.toBe(ref);
        expect(computeProposalDigest('t1', 'u1', 'K', { a: 2 })).not.toBe(ref);
    });
});

describe('createCollectionFollowupProposal', () => {
    it('rejects PROMISE_TO_PAY without promisedDate and amount', async () => {
        await expect(
            createCollectionFollowupProposal({
                ...base,
                payload: { invoiceId: 'inv1', type: 'PROMISE_TO_PAY' },
            }),
        ).rejects.toThrow(/promisedDate/);
        expect(prisma.assistantActionProposal.upsert).not.toHaveBeenCalled();
    });

    it('rejects unknown activity types', async () => {
        await expect(
            createCollectionFollowupProposal({
                ...base,
                payload: { invoiceId: 'inv1', type: 'DELETE_ALL' as never },
            }),
        ).rejects.toThrow();
    });

    it('fails before storing when the invoice is out of scope', async () => {
        base.assertInvoiceAccess.mockRejectedValue(new Error('NOT_FOUND'));
        await expect(
            createCollectionFollowupProposal({ ...base, payload }),
        ).rejects.toThrow('NOT_FOUND');
        expect(prisma.assistantActionProposal.upsert).not.toHaveBeenCalled();
    });

    it('upserts a PENDING proposal keyed by conversation + digest with a TTL', async () => {
        vi.mocked(prisma.assistantActionProposal.upsert).mockResolvedValue({
            id: 'p1',
        } as never);
        await createCollectionFollowupProposal({ ...base, payload });
        const arg = vi.mocked(prisma.assistantActionProposal.upsert).mock
            .calls[0][0];
        expect(arg.create).toMatchObject({
            tenantId: 't1',
            userId: 'u1',
            conversationId: 'c1',
            kind: 'COLLECTION_FOLLOWUP',
            status: 'PENDING',
            expiresAt: new Date(NOW.getTime() + PROPOSAL_TTL_MS),
        });
        expect(arg.where.conversationId_payloadDigest?.conversationId).toBe(
            'c1',
        );
        // Re-proposing must not reset an already decided proposal.
        expect(arg.update).toEqual({});
    });
});

describe('confirmProposal', () => {
    const pending = {
        id: 'p1',
        tenantId: 't1',
        userId: 'u1',
        kind: 'COLLECTION_FOLLOWUP',
        payload: { ...payload, activityDate: undefined },
        status: 'PENDING',
        expiresAt: new Date(NOW.getTime() + 1000),
    };

    it('claims atomically, executes via the service and audits in one transaction', async () => {
        tx.assistantActionProposal.updateMany.mockResolvedValue({ count: 1 });
        tx.assistantActionProposal.findFirst.mockResolvedValue(pending);
        vi.mocked(CollectionService.logCollectionActivity).mockResolvedValue({
            id: 'ca1',
        } as never);

        const res = await confirmProposal({
            proposalId: 'p1',
            tenantId: 't1',
            userId: 'u1',
            now: NOW,
            assertInvoiceAccess: base.assertInvoiceAccess,
        });

        const claim = tx.assistantActionProposal.updateMany.mock.calls[0][0];
        expect(claim.where).toMatchObject({
            id: 'p1',
            tenantId: 't1',
            userId: 'u1',
            status: 'PENDING',
        });
        expect(claim.where.expiresAt).toEqual({ gt: NOW });
        expect(CollectionService.logCollectionActivity).toHaveBeenCalledWith(
            expect.objectContaining({ invoiceId: 'inv1', userId: 'u1' }),
            tx,
        );
        expect(logActivity).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'u1',
                entityId: 'ca1',
                tx,
            }),
        );
        expect(tx.assistantActionProposal.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'p1' },
                data: { resultRef: 'ca1' },
            }),
        );
        expect(res).toEqual({ proposalId: 'p1', resultRef: 'ca1' });
    });

    it('does not execute when the claim loses (already confirmed, expired or wrong user)', async () => {
        tx.assistantActionProposal.updateMany.mockResolvedValue({ count: 0 });
        vi.mocked(prisma.assistantActionProposal.findFirst).mockResolvedValue({
            status: 'CONFIRMED',
        } as never);

        await expect(
            confirmProposal({
                proposalId: 'p1',
                tenantId: 't1',
                userId: 'u1',
                now: NOW,
                assertInvoiceAccess: base.assertInvoiceAccess,
            }),
        ).rejects.toThrow(/PROPOSAL_NOT_CONFIRMABLE/);
        expect(CollectionService.logCollectionActivity).not.toHaveBeenCalled();
    });

    it('propagates execution failure so the claim rolls back with the transaction', async () => {
        tx.assistantActionProposal.updateMany.mockResolvedValue({ count: 1 });
        tx.assistantActionProposal.findFirst.mockResolvedValue(pending);
        vi.mocked(CollectionService.logCollectionActivity).mockRejectedValue(
            new Error('boom'),
        );
        await expect(
            confirmProposal({
                proposalId: 'p1',
                tenantId: 't1',
                userId: 'u1',
                now: NOW,
                assertInvoiceAccess: base.assertInvoiceAccess,
            }),
        ).rejects.toThrow('boom');
        expect(logActivity).not.toHaveBeenCalled();
    });

    it('re-checks invoice scope at confirm time and executes nothing if lost', async () => {
        base.assertInvoiceAccess.mockRejectedValue(new Error('NOT_FOUND'));
        tx.assistantActionProposal.updateMany.mockResolvedValue({ count: 1 });
        tx.assistantActionProposal.findFirst.mockResolvedValue(pending);
        await expect(
            confirmProposal({
                proposalId: 'p1',
                tenantId: 't1',
                userId: 'u1',
                now: NOW,
                assertInvoiceAccess: base.assertInvoiceAccess,
            }),
        ).rejects.toThrow('NOT_FOUND');
        expect(CollectionService.logCollectionActivity).not.toHaveBeenCalled();
    });
});

describe('cancelProposal', () => {
    it('only cancels the owner\'s PENDING proposal', async () => {
        vi.mocked(prisma.assistantActionProposal.updateMany).mockResolvedValue({
            count: 1,
        });
        await cancelProposal({
            proposalId: 'p1',
            tenantId: 't1',
            userId: 'u1',
        });
        expect(
            vi.mocked(prisma.assistantActionProposal.updateMany).mock
                .calls[0][0],
        ).toMatchObject({
            where: {
                id: 'p1',
                tenantId: 't1',
                userId: 'u1',
                status: 'PENDING',
            },
            data: { status: 'CANCELLED' },
        });
    });
});
