import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ findMany: vi.fn(), findFirst: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        account: { findMany: m.findMany },
        expenseClaim: { findFirst: m.findFirst },
    },
}));

import { listPayableClaimAccounts } from '../expense-claim-account-queries';

const CATEGORY_COUNT = 6;

type PaidRow = { expenseAccountId: string | null; paymentAccountId: string | null };

/** Newest PAID claim per category; `overall` is the newest PAID claim of any category. */
function mockPaidHistory(
    byCategory: Record<string, PaidRow>,
    overall: PaidRow | null,
) {
    m.findFirst.mockImplementation(async ({ where }) =>
        where.category ? (byCategory[where.category] ?? null) : overall,
    );
}

describe('listPayableClaimAccounts', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        m.findMany.mockResolvedValueOnce([
            { id: 'e1', code: '61100', name: 'Biaya A' },
        ]);
        m.findMany.mockResolvedValueOnce([
            { id: 'p1', code: '11110', name: 'Kas Kecil' },
        ]);
        mockPaidHistory({}, null);
    });

    it('queries active leaf EXPENSE accounts for the expense side', async () => {
        await listPayableClaimAccounts();

        const where = m.findMany.mock.calls[0][0].where;
        expect(where).toEqual({
            isActive: true,
            children: { none: {} },
            type: 'EXPENSE',
        });
    });

    it('queries active leaf ASSET cash/bank accounts for the source side', async () => {
        await listPayableClaimAccounts();

        const where = m.findMany.mock.calls[1][0].where;
        expect(where).toEqual({
            isActive: true,
            children: { none: {} },
            type: 'ASSET',
            isCashAccount: true,
        });
    });

    it('selects only id, code and name and orders by code', async () => {
        await listPayableClaimAccounts();

        for (const [args] of m.findMany.mock.calls) {
            expect(args.select).toEqual({ id: true, code: true, name: true });
            expect(args.orderBy).toEqual({ code: 'asc' });
        }
    });

    it('returns both lists', async () => {
        const result = await listPayableClaimAccounts();

        expect(result.expenseAccounts).toEqual([
            { id: 'e1', code: '61100', name: 'Biaya A' },
        ]);
        expect(result.paymentAccounts).toEqual([
            { id: 'p1', code: '11110', name: 'Kas Kecil' },
        ]);
    });
});

describe('listPayableClaimAccounts defaults', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        m.findMany.mockResolvedValueOnce([
            { id: 'e-bbm', code: '61100', name: 'Biaya BBM' },
            { id: 'e-tol', code: '61200', name: 'Biaya Tol' },
        ]);
        m.findMany.mockResolvedValueOnce([
            { id: 'cash', code: '11110', name: 'Kas Kecil' },
            { id: 'bank', code: '11120', name: 'Bank' },
        ]);
    });

    it('defaults to the accounts of the newest PAID claim per category and overall', async () => {
        mockPaidHistory(
            {
                BBM: { expenseAccountId: 'e-bbm', paymentAccountId: 'cash' },
                TOL: { expenseAccountId: 'e-tol', paymentAccountId: 'cash' },
            },
            { expenseAccountId: 'e-tol', paymentAccountId: 'bank' },
        );

        const { defaults } = await listPayableClaimAccounts();

        expect(defaults).toEqual({
            expenseByCategory: { BBM: 'e-bbm', TOL: 'e-tol' },
            paymentAccountId: 'bank',
        });
    });

    it('asks for the newest PAID claim: PAID only, paidAt then id descending, ids only', async () => {
        mockPaidHistory({}, null);

        await listPayableClaimAccounts();

        const calls = m.findFirst.mock.calls.map(([args]) => args);
        for (const args of calls) {
            expect(args.where.status).toBe('PAID');
            expect(args.orderBy).toEqual([{ paidAt: 'desc' }, { id: 'desc' }]);
            expect(args.select).toEqual({ expenseAccountId: true, paymentAccountId: true });
        }
        const categories = calls.map((args) => args.where.category).filter(Boolean);
        expect(categories.sort()).toEqual(['BBM', 'LAINNYA', 'MAKAN', 'PARKIR', 'TOL', 'TRANSPORT_LAIN']);
    });

    it('uses one lookup per category plus one overall, not one per account or claim', async () => {
        mockPaidHistory({}, null);

        await listPayableClaimAccounts();

        expect(m.findFirst).toHaveBeenCalledTimes(CATEGORY_COUNT + 1);
        expect(m.findMany).toHaveBeenCalledTimes(2);
    });

    it('has no default when nothing was ever paid', async () => {
        mockPaidHistory({}, null);

        const { defaults } = await listPayableClaimAccounts();

        expect(defaults).toEqual({ expenseByCategory: {}, paymentAccountId: null });
    });

    it('leaves out categories that were never paid', async () => {
        mockPaidHistory(
            { BBM: { expenseAccountId: 'e-bbm', paymentAccountId: 'cash' } },
            { expenseAccountId: 'e-bbm', paymentAccountId: 'cash' },
        );

        const { defaults } = await listPayableClaimAccounts();

        expect(defaults.expenseByCategory).toEqual({ BBM: 'e-bbm' });
    });

    it('drops an expense default that is no longer an active leaf EXPENSE account', async () => {
        mockPaidHistory(
            {
                BBM: { expenseAccountId: 'e-retired', paymentAccountId: 'cash' },
                TOL: { expenseAccountId: 'e-tol', paymentAccountId: 'cash' },
            },
            { expenseAccountId: 'e-retired', paymentAccountId: 'cash' },
        );

        const { defaults } = await listPayableClaimAccounts();

        expect(defaults.expenseByCategory).toEqual({ TOL: 'e-tol' });
    });

    it('drops a source default that is no longer an active leaf cash/bank account', async () => {
        mockPaidHistory({}, { expenseAccountId: 'e-bbm', paymentAccountId: 'cash-closed' });

        const { defaults } = await listPayableClaimAccounts();

        expect(defaults.paymentAccountId).toBeNull();
    });

    it('does not fall back to an older claim when the newest one has an invalid account', async () => {
        mockPaidHistory({ BBM: { expenseAccountId: 'e-retired', paymentAccountId: 'cash' } }, null);

        const { defaults } = await listPayableClaimAccounts();

        expect(defaults.expenseByCategory).toEqual({});
        expect(m.findFirst.mock.calls.filter(([a]) => a.where.category === 'BBM')).toHaveLength(1);
    });

    it('ignores claims whose accounts were never recorded', async () => {
        mockPaidHistory(
            { BBM: { expenseAccountId: null, paymentAccountId: null } },
            { expenseAccountId: null, paymentAccountId: null },
        );

        const { defaults } = await listPayableClaimAccounts();

        expect(defaults).toEqual({ expenseByCategory: {}, paymentAccountId: null });
    });
});
