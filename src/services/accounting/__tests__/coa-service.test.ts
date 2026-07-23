import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getChartOfAccounts, createAccount, updateAccount, deleteAccount } from '../coa-service';
import { prisma } from '@/lib/core/prisma';
import { AccountType, AccountCategory } from '@prisma/client';

// Mock prisma
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        account: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        journalLine: {
            findFirst: vi.fn(),
        },
    },
}));

describe('coa-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getChartOfAccounts', () => {
        it('should return all accounts ordered by code', async () => {
            // Arrange
            const mockAccounts = [
                { id: '1', code: '1000', name: 'Cash', type: 'ASSET' },
                { id: '2', code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
            ];

            vi.mocked(prisma.account.findMany).mockResolvedValue(mockAccounts as any);

            // Act
            const result = await getChartOfAccounts();

            // Assert
            expect(result).toEqual(mockAccounts);
            expect(prisma.account.findMany).toHaveBeenCalledWith({
                orderBy: { code: 'asc' },
            });
        });

        it('should return empty array when no accounts exist', async () => {
            // Arrange
            vi.mocked(prisma.account.findMany).mockResolvedValue([]);

            // Act
            const result = await getChartOfAccounts();

            // Assert
            expect(result).toEqual([]);
        });
    });

    describe('createAccount', () => {
        it('should create a new account', async () => {
            // Arrange
            const accountData = {
                code: '1000',
                name: 'Cash',
                type: AccountType.ASSET,
                category: AccountCategory.CURRENT_ASSET,
                description: 'Cash on hand',
            };

            const mockCreatedAccount = {
                id: '1',
                ...accountData,
            };

            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.account.create).mockResolvedValue(mockCreatedAccount as any);

            // Act
            const result = await createAccount(accountData);

            // Assert
            expect(result).toEqual(mockCreatedAccount);
            expect(prisma.account.create).toHaveBeenCalledWith({ data: accountData });
        });

        it('should throw error when account code sudah ada', async () => {
            // Arrange
            const accountData = {
                code: '1000',
                name: 'Cash',
                type: AccountType.ASSET,
                category: AccountCategory.CURRENT_ASSET,
            };

            const existingAccount = {
                id: '1',
                code: '1000',
                name: 'Existing Account',
            };

            vi.mocked(prisma.account.findUnique).mockResolvedValue(existingAccount as any);

            // Act & Assert
            await expect(createAccount(accountData)).rejects.toThrow(
                'Kode akun'
            );
        });
    });

    describe('updateAccount', () => {
        it('should update account when code is unique', async () => {
            // Arrange
            const updateData = {
                code: '1001',
                name: 'Cash Updated',
            };

            const mockUpdatedAccount = {
                id: '1',
                ...updateData,
            };

            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.account.update).mockResolvedValue(mockUpdatedAccount as any);

            // Act
            const result = await updateAccount('1', updateData);

            // Assert
            expect(result).toEqual(mockUpdatedAccount);
            expect(prisma.account.update).toHaveBeenCalledWith({
                where: { id: '1' },
                data: updateData,
            });
        });

        it('should allow updating same account with same code', async () => {
            // Arrange
            const updateData = {
                name: 'Cash Updated',
            };

            const mockUpdatedAccount = {
                id: '1',
                code: '1000',
                ...updateData,
            };

            vi.mocked(prisma.account.update).mockResolvedValue(mockUpdatedAccount as any);

            // Act
            const result = await updateAccount('1', updateData);

            // Assert
            expect(result).toEqual(mockUpdatedAccount);
        });

        it('should throw error when code sudah ada for different account', async () => {
            // Arrange
            const updateData = {
                code: '2000',
            };

            const existingAccount = {
                id: '2',
                code: '2000',
            };

            vi.mocked(prisma.account.findUnique).mockResolvedValue(existingAccount as any);

            // Act & Assert
            await expect(updateAccount('1', updateData)).rejects.toThrow(
                'Kode akun'
            );
        });
    });

    describe('deleteAccount', () => {
        it('should delete account when no transactions exist', async () => {
            // Arrange
            vi.mocked(prisma.journalLine.findFirst).mockResolvedValue(null);
            vi.mocked(prisma.account.delete).mockResolvedValue({ id: '1' } as any);

            // Act
            const result = await deleteAccount('1');

            // Assert
            expect(result).toEqual({ id: '1' });
            expect(prisma.account.delete).toHaveBeenCalledWith({
                where: { id: '1' },
            });
        });

        it('should throw error when account has transactions', async () => {
            // Arrange
            vi.mocked(prisma.journalLine.findFirst).mockResolvedValue({
                id: 'line-1',
                accountId: '1',
            } as any);

            // Act & Assert
            await expect(deleteAccount('1')).rejects.toThrow(
                'Tidak dapat menghapus akun karena masih memiliki transaksi. Pertimbangkan untuk menonaktifkannya saja.'
            );
        });
    });
});
