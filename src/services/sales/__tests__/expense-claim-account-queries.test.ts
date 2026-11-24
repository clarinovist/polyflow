import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { account: { findMany: m.findMany } },
}));

import { listPayableClaimAccounts } from '../expense-claim-account-queries';

describe('listPayableClaimAccounts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        m.findMany.mockResolvedValueOnce([
            { id: 'e1', code: '61100', name: 'Biaya A' },
        ]);
        m.findMany.mockResolvedValueOnce([
            { id: 'p1', code: '11110', name: 'Kas Kecil' },
        ]);
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
