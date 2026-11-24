import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    claim: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
}));
vi.mock('@/lib/core/prisma', () => ({ prisma: { expenseClaim: mocks.claim } }));

import {
    getClaimsSummaryCounts,
    getMyClaim,
    listClaimsForPayment,
    listClaimsForReview,
    listMyClaims,
    listPaidClaims,
} from '../expense-claim-queries';

beforeEach(() => {
    vi.resetAllMocks();
    mocks.claim.findMany.mockResolvedValue([]);
});

describe('listMyClaims', () => {
    it('only queries the signed-in user, newest first, with a bounded take and a narrow select', async () => {
        await listMyClaims('user-1');

        const args = mocks.claim.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ userId: 'user-1' });
        expect(args.take).toBe(50);
        expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
        expect(args.include).toBeUndefined();
        expect(args.select.user).toEqual({ select: { name: true } });
        expect(args.select.salesVisit.select.customer).toEqual({ select: { name: true } });
    });

    it('clamps an oversized take', async () => {
        await listMyClaims('user-1', { take: 100_000 });
        expect(mocks.claim.findMany.mock.calls[0][0].take).toBe(100);
    });
});

describe('getMyClaim', () => {
    it('scopes the lookup to the owner', async () => {
        mocks.claim.findFirst.mockResolvedValue({ id: 'c1' });
        await expect(getMyClaim('user-1', 'c1')).resolves.toEqual({ id: 'c1' });
        expect(mocks.claim.findFirst.mock.calls[0][0].where).toEqual({ id: 'c1', userId: 'user-1' });
    });

    it("reports someone else's claim as not found", async () => {
        mocks.claim.findFirst.mockResolvedValue(null);
        await expect(getMyClaim('user-1', 'c9')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
});

describe('listClaimsForReview', () => {
    it('defaults to SUBMITTED, oldest first', async () => {
        await listClaimsForReview();
        const args = mocks.claim.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ status: 'SUBMITTED' });
        expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
        expect(args.take).toBe(50);
    });

    it('filters by another status, newest first', async () => {
        await listClaimsForReview({ status: 'REJECTED', take: 5 });
        const args = mocks.claim.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ status: 'REJECTED' });
        expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
        expect(args.take).toBe(5);
    });
});

describe('listClaimsForPayment', () => {
    it('lists only APPROVED claims, oldest first and bounded', async () => {
        await listClaimsForPayment();
        const args = mocks.claim.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ status: 'APPROVED' });
        expect(args.orderBy).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
        expect(args.take).toBe(50);
    });
});

describe('listPaidClaims', () => {
    it('lists only PAID claims, newest payment first, with a stable tie-break', async () => {
        await listPaidClaims();
        const args = mocks.claim.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ status: 'PAID' });
        expect(args.orderBy).toEqual([{ paidAt: 'desc' }, { id: 'desc' }]);
        expect(args.take).toBe(50);
    });

    it('clamps take to the list maximum and to at least one', async () => {
        await listPaidClaims({ take: 100_000 });
        await listPaidClaims({ take: 0 });
        expect(mocks.claim.findMany.mock.calls[0][0].take).toBe(100);
        expect(mocks.claim.findMany.mock.calls[1][0].take).toBe(1);
    });

    it('selects only the narrow paid projection with account codes/names and the journal number', async () => {
        await listPaidClaims();
        const { select, include } = mocks.claim.findMany.mock.calls[0][0];
        expect(include).toBeUndefined();
        expect(select.paidAt).toBe(true);
        expect(select.user).toEqual({ select: { name: true } });
        expect(select.expenseAccount).toEqual({ select: { code: true, name: true } });
        expect(select.paymentAccount).toEqual({ select: { code: true, name: true } });
        expect(select.journalEntry).toEqual({ select: { entryNumber: true } });
    });

    it('returns the rows as read', async () => {
        const rows = [{ id: 'c1' }];
        mocks.claim.findMany.mockResolvedValue(rows);
        await expect(listPaidClaims()).resolves.toBe(rows);
    });
});

describe('getClaimsSummaryCounts', () => {
    it('counts SUBMITTED and APPROVED claims', async () => {
        mocks.claim.count.mockImplementation(async ({ where }) => (where.status === 'SUBMITTED' ? 3 : 2));
        await expect(getClaimsSummaryCounts()).resolves.toEqual({ submitted: 3, approved: 2 });
    });
});
