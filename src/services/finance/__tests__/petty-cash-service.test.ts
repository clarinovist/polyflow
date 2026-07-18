import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PettyCashService } from '../petty-cash-service';
import { prisma } from '@/lib/core/prisma';

// Mock prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        pettyCashTransaction: {
            findMany: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
        },
        account: {
            findUnique: vi.fn(),
        },
        journalLine: {
            aggregate: vi.fn(),
        },
    },
}));

// Mock account-resolver
vi.mock('@/services/accounting/account-resolver', () => ({
    resolveAccount: vi.fn(),
}));

// Mock journals-service
vi.mock('@/services/accounting/journals-service', () => ({
    createJournalEntry: vi.fn(),
    postJournal: vi.fn(),
}));

describe('PettyCashService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getTransactions', () => {
        it('should return all petty cash transactions', async () => {
            // Arrange
            const mockTransactions = [
                {
                    id: '1',
                    voucherNumber: 'PCV-202401-001',
                    date: new Date(2024, 0, 15),
                    description: 'Office supplies',
                    amount: 100,
                    type: 'EXPENSE',
                    status: 'DRAFT',
                    expenseAccount: { id: 'exp-1', name: 'Office Supplies' },
                    createdBy: { name: 'John' },
                },
            ];

            vi.mocked(prisma.pettyCashTransaction.findMany).mockResolvedValue(mockTransactions as any);

            // Act
            const result = await PettyCashService.getTransactions();

            // Assert
            expect(result).toEqual(mockTransactions);
            expect(prisma.pettyCashTransaction.findMany).toHaveBeenCalledWith({
                include: {
                    expenseAccount: true,
                    createdBy: { select: { name: true } },
                },
                orderBy: { date: 'desc' },
            });
        });

        it('should return empty array when no transactions exist', async () => {
            // Arrange
            vi.mocked(prisma.pettyCashTransaction.findMany).mockResolvedValue([]);

            // Act
            const result = await PettyCashService.getTransactions();

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe('getBalance', () => {
        it('should return petty cash balance', async () => {
            // Arrange
            const { resolveAccount } = await import('@/services/accounting/account-resolver');

            vi.mocked(resolveAccount).mockResolvedValue({ id: 'petty-cash-id' } as any);
            vi.mocked(prisma.account.findUnique).mockResolvedValue({ id: 'petty-cash-id' } as any);
            vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
                _sum: { debit: { toNumber: () => 1000 }, credit: { toNumber: () => 300 } },
            } as any);

            // Act
            const result = await PettyCashService.getBalance();

            // Assert
            expect(result).toBe(700); // 1000 - 300
        });

        it('should return 0 when account not found', async () => {
            // Arrange
            const { resolveAccount } = await import('@/services/accounting/account-resolver');

            vi.mocked(resolveAccount).mockResolvedValue({ id: 'petty-cash-id' } as any);
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);

            // Act
            const result = await PettyCashService.getBalance();

            // Assert
            expect(result).toBe(0);
        });

        it('should return 0 when no journal lines exist', async () => {
            // Arrange
            const { resolveAccount } = await import('@/services/accounting/account-resolver');

            vi.mocked(resolveAccount).mockResolvedValue({ id: 'petty-cash-id' } as any);
            vi.mocked(prisma.account.findUnique).mockResolvedValue({ id: 'petty-cash-id' } as any);
            vi.mocked(prisma.journalLine.aggregate).mockResolvedValue({
                _sum: { debit: null, credit: null },
            } as any);

            // Act
            const result = await PettyCashService.getBalance();

            // Assert
            expect(result).toBe(0);
        });
    });

    describe('createExpense', () => {
        it('should create expense with generated voucher number', async () => {
            // Arrange
            const mockCreatedTransaction = {
                id: '1',
                voucherNumber: 'PCV-202401-001',
                date: new Date(2024, 0, 15),
                description: 'Office supplies',
                amount: 100,
                type: 'EXPENSE',
                status: 'DRAFT',
                createdById: 'user-1',
            };

            vi.mocked(prisma.pettyCashTransaction.count).mockResolvedValue(0);
            vi.mocked(prisma.pettyCashTransaction.create).mockResolvedValue(mockCreatedTransaction as any);

            // Act
            const result = await PettyCashService.createExpense(
                {
                    date: new Date(2024, 0, 15),
                    description: 'Office supplies',
                    amount: 100,
                },
                'user-1'
            );

            // Assert
            expect(result).toEqual(mockCreatedTransaction);
            expect(prisma.pettyCashTransaction.create).toHaveBeenCalled();
        });

        it('should normalize the expense date to WIB business-day midnight', async () => {
            // A picker Date for 15 Jan 2024 00:00 WIB = 14 Jan 2024 17:00 UTC
            const picker = new Date('2024-01-14T17:00:00.000Z');

            vi.mocked(prisma.pettyCashTransaction.count).mockResolvedValue(0);
            vi.mocked(prisma.pettyCashTransaction.create).mockResolvedValue({ id: '1' } as any);

            await PettyCashService.createExpense(
                { date: picker, description: 'Office supplies', amount: 100 },
                'user-1'
            );

            const createArg = vi.mocked(prisma.pettyCashTransaction.create).mock.calls[0][0];
            // Stored date must be anchored to WIB midnight (15 Jan 2024 00:00 WIB)
            expect((createArg.data.date as Date).toISOString()).toBe('2024-01-14T17:00:00.000Z');
        });

        it('should increment voucher number based on existing count', async () => {
            // Arrange
            const mockCreatedTransaction = {
                id: '2',
                voucherNumber: 'PCV-202401-002',
            };

            vi.mocked(prisma.pettyCashTransaction.count).mockResolvedValue(1);
            vi.mocked(prisma.pettyCashTransaction.create).mockResolvedValue(mockCreatedTransaction as any);

            // Act
            const result = await PettyCashService.createExpense(
                {
                    date: new Date(2024, 0, 15),
                    description: 'Office supplies',
                    amount: 100,
                },
                'user-1'
            );

            // Assert
            expect(result.voucherNumber).toBe('PCV-202401-002');
        });
    });
});
