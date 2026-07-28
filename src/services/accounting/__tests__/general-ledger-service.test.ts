import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getGeneralLedger } from '../general-ledger-service';
import { prisma } from '@/lib/core/prisma';
import { AccountType } from '@prisma/client';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        journalLine: {
            findMany: vi.fn(),
        },
    },
}));

describe('general-ledger-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getGeneralLedger', () => {
        it('should return empty ledger data when no journal lines exist', async () => {
            vi.mocked(prisma.journalLine.findMany).mockResolvedValue([]);

            const result = await getGeneralLedger();

            expect(result).toEqual({
                accounts: [],
                grandTotalDebit: 0,
                grandTotalCredit: 0,
            });
        });

        it('should calculate general ledger with running balance for debit-normal and credit-normal accounts', async () => {
            const mockLines = [
                {
                    id: 'jl-1',
                    accountId: 'acc-asset',
                    debit: 1000,
                    credit: 0,
                    description: 'Kas Masuk',
                    journalEntry: {
                        id: 'je-1',
                        entryNumber: 'JE-001',
                        entryDate: new Date('2026-07-01T00:00:00Z'),
                        description: 'Sales Receipt',
                        reference: 'SO-101',
                        referenceType: 'SALES_ORDER',
                    },
                    account: {
                        id: 'acc-asset',
                        code: '1101',
                        name: 'Kas',
                        type: AccountType.ASSET,
                        category: 'Kas & Bank',
                    },
                },
                {
                    id: 'jl-2',
                    accountId: 'acc-asset',
                    debit: 0,
                    credit: 200,
                    description: 'Bayar Beban',
                    journalEntry: {
                        id: 'je-2',
                        entryNumber: 'JE-002',
                        entryDate: new Date('2026-07-02T00:00:00Z'),
                        description: 'Beban Operasional',
                        reference: 'EXP-101',
                        referenceType: 'EXPENSE',
                    },
                    account: {
                        id: 'acc-asset',
                        code: '1101',
                        name: 'Kas',
                        type: AccountType.ASSET,
                        category: 'Kas & Bank',
                    },
                },
                {
                    id: 'jl-3',
                    accountId: 'acc-liability',
                    debit: 0,
                    credit: 500,
                    description: 'Hutang Usaha',
                    journalEntry: {
                        id: 'je-3',
                        entryNumber: 'JE-003',
                        entryDate: new Date('2026-07-03T00:00:00Z'),
                        description: 'Hutang Pembelian',
                        reference: 'PO-101',
                        referenceType: 'PURCHASE_ORDER',
                    },
                    account: {
                        id: 'acc-liability',
                        code: '2101',
                        name: 'Hutang Usaha',
                        type: AccountType.LIABILITY,
                        category: 'Hutang Lancar',
                    },
                },
            ];

            vi.mocked(prisma.journalLine.findMany).mockResolvedValue(mockLines as any);

            const result = await getGeneralLedger();

            expect(result.accounts).toHaveLength(2);
            expect(result.grandTotalDebit).toBe(1000);
            expect(result.grandTotalCredit).toBe(700);

            // Asset Account (debit-normal)
            const assetAcc = result.accounts.find((a) => a.code === '1101');
            expect(assetAcc).toBeDefined();
            expect(assetAcc?.totalDebit).toBe(1000);
            expect(assetAcc?.totalCredit).toBe(200);
            expect(assetAcc?.endingBalance).toBe(800);
            expect(assetAcc?.entries).toHaveLength(2);
            expect(assetAcc?.entries[0].balance).toBe(1000);
            expect(assetAcc?.entries[1].balance).toBe(800);

            // Liability Account (credit-normal)
            const liabAcc = result.accounts.find((a) => a.code === '2101');
            expect(liabAcc).toBeDefined();
            expect(liabAcc?.totalDebit).toBe(0);
            expect(liabAcc?.totalCredit).toBe(500);
            expect(liabAcc?.endingBalance).toBe(500);
            expect(liabAcc?.entries[0].balance).toBe(500);
        });

        it('should compute pre-range beginning balance when date range is provided', async () => {
            const mockLines = [
                {
                    id: 'jl-10',
                    accountId: 'acc-asset',
                    debit: 300,
                    credit: 0,
                    description: 'Kas Jul',
                    journalEntry: {
                        id: 'je-10',
                        entryNumber: 'JE-010',
                        entryDate: new Date('2026-07-15T00:00:00Z'),
                        description: 'Receipt Jul',
                        reference: null,
                        referenceType: null,
                    },
                    account: {
                        id: 'acc-asset',
                        code: '1101',
                        name: 'Kas',
                        type: AccountType.ASSET,
                        category: 'Kas & Bank',
                    },
                },
            ];

            const mockPreLines = [
                {
                    accountId: 'acc-asset',
                    debit: 500,
                    credit: 100,
                    account: { id: 'acc-asset', type: AccountType.ASSET },
                },
            ];

            // First call for range lines, second call for preLines
            vi.mocked(prisma.journalLine.findMany)
                .mockResolvedValueOnce(mockLines as any)
                .mockResolvedValueOnce(mockPreLines as any);

            const startDate = new Date('2026-07-01T00:00:00Z');
            const endDate = new Date('2026-07-31T23:59:59Z');
            const result = await getGeneralLedger(startDate, endDate);

            expect(result.accounts).toHaveLength(1);
            const assetAcc = result.accounts[0];
            // Beginning balance was 500 - 100 = 400.
            // With +300 debit entry, ending balance = 700.
            expect(assetAcc.endingBalance).toBe(700);
            expect(assetAcc.entries[0].balance).toBe(700);
        });
    });
});
