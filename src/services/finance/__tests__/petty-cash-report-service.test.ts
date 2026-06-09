import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PettyCashReportService } from '../petty-cash-report-service';
import { prisma } from '@/lib/core/prisma';

// Mock Prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        account: {
            findFirst: vi.fn(),
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

describe('PettyCashReportService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getDailyReport', () => {
        it('should throw an error if Petty Cash account (11110) is not found', async () => {
            vi.mocked(prisma.pettyCashDailyReport.findFirst).mockResolvedValue(null);
            vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

            await expect(
                PettyCashReportService.getDailyReport(new Date('2026-06-09'))
            ).rejects.toThrow("Petty Cash account (11110) not found");
        });

        it('should calculate opening balance, daily totals, and return transactions', async () => {
            vi.mocked(prisma.pettyCashDailyReport.findFirst).mockResolvedValue(null);
            const mockAccount = { id: 'acc-123', code: '11110', name: 'Kas Kecil' };
            vi.mocked(prisma.account.findFirst).mockResolvedValue(mockAccount as never);

            // Mock opening balance aggregate (debit=500000, credit=100000 -> balance=400000)
            vi.mocked(prisma.journalLine.aggregate)
                .mockResolvedValueOnce({
                    _sum: { debit: 500000, credit: 100000 }
                } as never) // first call for opening balance
                .mockResolvedValueOnce({
                    _sum: { debit: 200000, credit: 50000 }
                } as never); // second call for daily totals

            const mockTransactions = [
                {
                    id: 'tx-1',
                    voucherNumber: 'PCV-001',
                    date: new Date('2026-06-09'),
                    description: 'Beli kertas',
                    amount: 50000,
                    type: 'EXPENSE',
                    status: 'POSTED',
                    expenseAccount: { code: '61100', name: 'Biaya Kantor' },
                    createdBy: { name: 'Admin' }
                }
            ];
            vi.mocked(prisma.pettyCashTransaction.findMany).mockResolvedValue(mockTransactions as never);

            const targetDate = new Date('2026-06-09');
            const report = await PettyCashReportService.getDailyReport(targetDate);

            // Verify account fetch
            expect(prisma.account.findFirst).toHaveBeenCalledWith({
                where: { code: '11110' }
            });

            // Verify opening balance calculation
            expect(report.openingBalance).toBe(400000); // 500000 - 100000

            // Verify daily totals calculation
            expect(report.totalIn).toBe(200000);
            expect(report.totalOut).toBe(50000);

            // Verify closing balance calculation (400000 + 200000 - 50000 = 550000)
            expect(report.closingBalance).toBe(550000);

            // Verify transactions
            expect(report.transactions).toEqual(mockTransactions);
        });
    });
});
