import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PettyCashReportService } from '../petty-cash-report-service';

const mockResolveAccount = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        account: {
            findUnique: vi.fn(),
        },
        journalLine: {
            aggregate: vi.fn(),
        },
        pettyCashDailyReport: {
            findFirst: vi.fn(),
        },
        pettyCashTransaction: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('@/services/accounting/account-resolver', () => ({
    resolveAccount: (...args: unknown[]) => mockResolveAccount(...args),
}));

import { prisma } from '@/lib/core/prisma';

describe('PettyCashReportService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveAccount.mockResolvedValue({ id: 'acc-123', code: '11110', name: 'Kas Kecil' });
    });

    describe('getDailyReport', () => {
        it('should throw an error if Petty Cash account is not found', async () => {
            vi.mocked(prisma.pettyCashDailyReport.findFirst).mockResolvedValue(null);
            mockResolveAccount.mockRejectedValue(
                new Error('Account not found for role "petty-cash"')
            );

            await expect(
                PettyCashReportService.getDailyReport(new Date('2026-06-09'))
            ).rejects.toThrow('Account not found for role "petty-cash"');
        });

        it('should calculate opening balance, daily totals, and return transactions', async () => {
            vi.mocked(prisma.pettyCashDailyReport.findFirst).mockResolvedValue(null);
            vi.mocked(prisma.account.findUnique).mockResolvedValue({ id: 'acc-123', code: '11110', name: 'Kas Kecil' } as never);

            vi.mocked(prisma.journalLine.aggregate)
                .mockResolvedValueOnce({
                    _sum: { debit: 500000, credit: 100000 }
                } as never)
                .mockResolvedValueOnce({
                    _sum: { debit: 200000, credit: 50000 }
                } as never);

            const mockTransactions = [
                {
                    id: 'tx-1', voucherNumber: 'PCV-001', date: new Date('2026-06-09'),
                    description: 'Beli kertas', amount: 50000, type: 'EXPENSE', status: 'POSTED',
                    expenseAccount: { code: '61100', name: 'Biaya Kantor' },
                    createdBy: { name: 'Admin' }
                }
            ];
            vi.mocked(prisma.pettyCashTransaction.findMany).mockResolvedValue(mockTransactions as never);

            const report = await PettyCashReportService.getDailyReport(new Date('2026-06-09'));

            expect(report.openingBalance).toBe(400000);
            expect(report.totalIn).toBe(200000);
            expect(report.totalOut).toBe(50000);
            expect(report.closingBalance).toBe(550000);
            expect(report.transactions).toEqual(mockTransactions);
        });
    });
});
