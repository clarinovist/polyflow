import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        assistantActionProposal: { findMany: vi.fn() },
        invoice: { findMany: vi.fn() },
    },
}));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('../../sales/collection-service', () => ({
    CollectionService: { logCollectionActivity: vi.fn() },
}));

import { prisma } from '@/lib/core/prisma';
import { listPendingProposals } from '../action-proposal-service';

const NOW = new Date('2026-11-05T10:00:00.000Z');
const findMany = vi.mocked(prisma.assistantActionProposal.findMany);
const invoices = vi.mocked(prisma.invoice.findMany);

beforeEach(() => vi.clearAllMocks());

describe('listPendingProposals', () => {
    it('only lists the owner\'s unexpired PENDING proposals', async () => {
        findMany.mockResolvedValue([]);
        await listPendingProposals({ tenantId: 't1', userId: 'u1', now: NOW });
        expect(findMany.mock.calls[0][0]).toMatchObject({
            where: {
                tenantId: 't1',
                userId: 'u1',
                status: 'PENDING',
                expiresAt: { gt: NOW },
            },
            take: 10,
        });
        expect(invoices).not.toHaveBeenCalled();
    });

    it('describes a proposal with the invoice number and never leaks raw payload keys', async () => {
        findMany.mockResolvedValue([
            {
                id: 'p1',
                kind: 'COLLECTION_FOLLOWUP',
                expiresAt: new Date(NOW.getTime() + 60_000),
                payload: {
                    invoiceId: 'inv1',
                    type: 'PROMISE_TO_PAY',
                    promisedDate: '2026-11-10T00:00:00.000Z',
                    promisedAmount: 1500000,
                    notes: 'janji transfer Senin',
                },
            },
        ] as never);
        invoices.mockResolvedValue([
            { id: 'inv1', invoiceNumber: 'INV-0001' },
        ] as never);

        const [view] = await listPendingProposals({
            tenantId: 't1',
            userId: 'u1',
            now: NOW,
        });

        expect(view.id).toBe('p1');
        expect(view.summary).toContain('INV-0001');
        expect(view.summary).toMatch(/janji bayar/i);
        expect(view.details.map((d) => d.label)).toEqual(
            expect.arrayContaining(['Catatan', 'Janji bayar']),
        );
        expect(view.expiresAt).toBe(
            new Date(NOW.getTime() + 60_000).toISOString(),
        );
    });

    it('skips proposals whose stored payload no longer validates', async () => {
        findMany.mockResolvedValue([
            {
                id: 'bad',
                kind: 'COLLECTION_FOLLOWUP',
                expiresAt: new Date(NOW.getTime() + 60_000),
                payload: { nonsense: true },
            },
        ] as never);
        invoices.mockResolvedValue([] as never);
        await expect(
            listPendingProposals({ tenantId: 't1', userId: 'u1', now: NOW }),
        ).resolves.toEqual([]);
    });
});
