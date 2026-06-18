import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        account: { findMany: vi.fn(), findUnique: vi.fn() },
        journalLine: { groupBy: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
        journalEntry: { findMany: vi.fn() },
    }
}));

import { prisma } from '@/lib/core/prisma';
import {
    getTrialBalance,
    getIncomeStatement,
    getBalanceSheet,
    getAccountBalance,
    getClosingBalances,
    type BalanceSheetGroup,
    type BalanceSheetItem,
} from '../reports-service';

describe('reports-service', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('getTrialBalance', () => {
        it('returns accounts with correct netBalance (debit - credit for assets)', async () => {
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                { id: 'a1', code: '11120', name: 'Bank BCA', type: 'ASSET', category: 'CURRENT_ASSET' },
                { id: 'a2', code: '21110', name: 'AP', type: 'LIABILITY', category: 'CURRENT_LIABILITY' },
            ] as never);

            vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([
                { accountId: 'a1', _sum: { debit: 5000000, credit: 2000000 } },
                { accountId: 'a2', _sum: { debit: 1000000, credit: 3000000 } },
            ] as never);

            const result = await getTrialBalance();

            const bank = result.find(r => r.code === '11120');
            const ap = result.find(r => r.code === '21110');

            // ASSET: debit - credit = normal balance
            expect(bank?.netBalance).toBe(3000000);
            // LIABILITY: credit - debit = normal balance
            expect(ap?.netBalance).toBe(2000000);
        });

        it('filters by date range when provided', async () => {
            vi.mocked(prisma.account.findMany).mockResolvedValue([]);
            vi.mocked(prisma.journalLine.groupBy).mockResolvedValue([]);

            await getTrialBalance(new Date('2026-01-01'), new Date('2026-06-30'));

            expect(prisma.journalLine.groupBy).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        journalEntry: expect.objectContaining({
                            entryDate: { gte: expect.any(Date), lte: expect.any(Date) }
                        })
                    })
                })
            );
        });
    });

    describe('getIncomeStatement', () => {
        it('calculates net income = revenue - COGS - OpEx + other', async () => {
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                { id: 'rev1', code: '41100', name: 'Sales', type: 'REVENUE', journalLines: [
                    { credit: 10000000, debit: 0 },
                ]},
                { id: 'cogs1', code: '51100', name: 'COGS', type: 'EXPENSE', journalLines: [
                    { credit: 0, debit: 4000000 },
                ]},
                { id: 'opex1', code: '62100', name: 'Salary', type: 'EXPENSE', journalLines: [
                    { credit: 0, debit: 2000000 },
                ]},
            ] as never);

            const result = await getIncomeStatement(new Date('2026-06-01'), new Date('2026-06-30'));

            expect(result.totalRevenue).toBe(10000000);
            expect(result.totalCOGS).toBe(4000000);
            expect(result.grossProfit).toBe(6000000);
            expect(result.totalOpEx).toBe(2000000);
            expect(result.operatingIncome).toBe(4000000);
            expect(result.netIncome).toBe(4000000);
        });

        it('excludes closing entries from calculation', async () => {
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                { id: 'rev1', code: '41100', name: 'Sales', type: 'REVENUE', journalLines: [] },
            ] as never);

            await getIncomeStatement(new Date('2026-06-01'), new Date('2026-06-30'));

            expect(prisma.account.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    include: expect.objectContaining({
                        journalLines: expect.objectContaining({
                            where: expect.objectContaining({
                                journalEntry: expect.objectContaining({
                                    NOT: { reference: { startsWith: 'CLOSING-' } }
                                })
                            })
                        })
                    })
                })
            );
        });
    });

    describe('getBalanceSheet', () => {
        it('returns unpostedEarnings as balancing figure', async () => {
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                { id: 'a1', code: '11120', parentId: null, type: 'ASSET', journalLines: [
                    { debit: 10000000, credit: 0 },
                ]},
                { id: 'l1', code: '21110', parentId: null, type: 'LIABILITY', journalLines: [
                    { debit: 0, credit: 3000000 },
                ]},
                { id: 'e1', code: '31110', parentId: null, type: 'EQUITY', journalLines: [
                    { debit: 0, credit: 5000000 },
                ]},
            ] as never);

            const result = await getBalanceSheet(new Date('2026-06-30'));

            expect(result.totalAssets).toBe(10000000);
            expect(result.totalLiabilities).toBe(3000000);
            expect(result.totalEquity).toBe(5000000);
            // unpostedEarnings = assets - liabilities - equity = 2000000
            expect(result.unpostedEarnings).toBe(2000000);
            // Total L+E+unposted = total assets
            expect(result.totalLiabilitiesAndEquity).toBe(result.totalAssets);
        });

        it('groups child accounts under parent accounts', async () => {
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                { id: 'parent-inv', code: '11300', parentId: null, type: 'ASSET', journalLines: [] },
                { id: 'child-rm', code: '11310', parentId: 'parent-inv', type: 'ASSET', journalLines: [
                    { debit: 5000000, credit: 0 },
                ]},
                { id: 'child-wip', code: '11320', parentId: 'parent-inv', type: 'ASSET', journalLines: [
                    { debit: 3000000, credit: 0 },
                ]},
                { id: 'child-fg', code: '11330', parentId: 'parent-inv', type: 'ASSET', journalLines: [
                    { debit: 2000000, credit: 0 },
                ]},
                { id: 'standalone', code: '11210', parentId: null, type: 'ASSET', journalLines: [
                    { debit: 1000000, credit: 0 },
                ]},
            ] as never);

            const result = await getBalanceSheet(new Date('2026-06-30'));

            // Flat view: 5 accounts
            expect(result.assets).toHaveLength(5);

            // Grouped view: 2 items (1 group + 1 standalone)
            expect(result.assetGroups).toHaveLength(2);

            // First: Inventory group (single-level → collapsed)
            const invGroup = result.assetGroups[0] as BalanceSheetGroup;
            expect(invGroup.code).toBe('11300');
            expect(invGroup.children).toHaveLength(3);
            expect(invGroup.totalBalance).toBe(10000000); // 5M + 3M + 2M

            // Second: standalone Piutang
            const standalone = result.assetGroups[1] as BalanceSheetItem;
            expect(standalone.code).toBe('11210');
            expect(standalone.netBalance).toBe(1000000);
        });

        it('expands accounts in expandCodes, groups others', async () => {
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                // 11000 Current Assets
                { id: 'ca', code: '11000', parentId: null, type: 'ASSET', journalLines: [] },
                // 11100 Cash & Bank (will be expanded)
                { id: 'cash-bank', code: '11100', parentId: 'ca', type: 'ASSET', journalLines: [] },
                { id: 'petty', code: '11110', parentId: 'cash-bank', type: 'ASSET', journalLines: [
                    { debit: 500000, credit: 0 },
                ]},
                { id: 'bca', code: '11120', parentId: 'cash-bank', type: 'ASSET', journalLines: [
                    { debit: 8000000, credit: 0 },
                ]},
                // 11300 Inventory (will be grouped)
                { id: 'inv', code: '11300', parentId: 'ca', type: 'ASSET', journalLines: [] },
                { id: 'rm', code: '11310', parentId: 'inv', type: 'ASSET', journalLines: [
                    { debit: 3000000, credit: 0 },
                ]},
                { id: 'fg', code: '11330', parentId: 'inv', type: 'ASSET', journalLines: [
                    { debit: 2000000, credit: 0 },
                ]},
            ] as never);

            // getBalanceSheet passes expandCodes=['11000','11100'] internally
            // 11000 expanded → shows 11100, 11300
            // 11100 expanded → shows 11110, 11120
            // 11300 not in expandCodes → grouped
            const result = await getBalanceSheet(new Date('2026-06-30'));

            const codes = result.assetGroups.map((g) => 'code' in g ? g.code : g.id);

            // 11000 expanded → 11100 and 11300 visible
            // 11100 expanded → 11110 and 11120 visible
            // 11300 grouped → shows as group
            expect(codes).toContain('11110'); // Petty Cash (from 11100 expand)
            expect(codes).toContain('11120'); // Bank BCA (from 11100 expand)

            // Inventory should be a group
            const invGroup = result.assetGroups.find((g): g is BalanceSheetGroup => 'children' in g && g.code === '11300');
            expect(invGroup).toBeDefined();
            expect(invGroup!.children).toHaveLength(2);
            expect(invGroup!.totalBalance).toBe(5000000);
        });
    });

    describe('getAccountBalance', () => {
        it('calculates balance for debit-normal accounts (ASSET)', async () => {
            vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
                { debit: 500000, credit: 0, journalEntry: {} },
                { debit: 0, credit: 200000, journalEntry: {} },
            ] as never);

            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'a1', code: '11120', type: 'ASSET'
            } as never);

            const balance = await getAccountBalance('a1');
            // ASSET: debit - credit = 500000 - 200000 = 300000
            expect(balance).toBe(300000);
        });

        it('calculates balance for credit-normal accounts (LIABILITY)', async () => {
            vi.mocked(prisma.journalLine.findMany).mockResolvedValue([
                { debit: 100000, credit: 0, journalEntry: {} },
                { debit: 0, credit: 400000, journalEntry: {} },
            ] as never);

            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'l1', code: '21110', type: 'LIABILITY'
            } as never);

            const balance = await getAccountBalance('l1');
            // LIABILITY: credit - debit = 400000 - 100000 = 300000
            expect(balance).toBe(300000);
        });
    });

    describe('getClosingBalances', () => {
        it('returns only accounts with non-zero balance', async () => {
            vi.mocked(prisma.account.findMany).mockResolvedValue([
                { id: 'rev1', type: 'REVENUE', journalLines: [
                    { credit: 5000000, debit: 0 },
                ]},
                { id: 'rev2', type: 'REVENUE', journalLines: [] }, // zero balance
                { id: 'exp1', type: 'EXPENSE', journalLines: [
                    { credit: 0, debit: 2000000 },
                ]},
            ] as never);

            const result = await getClosingBalances(new Date('2026-06-01'), new Date('2026-06-30'));

            // Only rev1 and exp1 should be included (non-zero balance)
            expect(result).toHaveLength(2);
            expect(result.find(r => r.id === 'rev2')).toBeUndefined();
        });
    });
});
