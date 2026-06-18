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
                { id: 'a1', code: '11120', type: 'ASSET', journalLines: [
                    { debit: 10000000, credit: 0 },
                ]},
                { id: 'l1', code: '21110', type: 'LIABILITY', journalLines: [
                    { debit: 0, credit: 3000000 },
                ]},
                { id: 'e1', code: '31110', type: 'EQUITY', journalLines: [
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
