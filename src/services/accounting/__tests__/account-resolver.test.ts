import { beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so these are available in the hoisted vi.mock factory
const { mockGetStore, mockGetMainPrisma, mockGetTenantIdFromContext } = vi.hoisted(() => ({
    mockGetStore: vi.fn(),
    mockGetMainPrisma: vi.fn(),
    mockGetTenantIdFromContext: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        account: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
        },
    },
    tenantContext: {
        getStore: mockGetStore,
    },
    getMainPrisma: mockGetMainPrisma,
    getTenantIdFromContext: mockGetTenantIdFromContext,
}));

import { prisma } from '@/lib/core/prisma';
import { resolveAccount, clearAccountCache } from '../account-resolver';

// Shared mock tenant DB instance (must have account methods for resolveByPatterns)
const mockTenantDb = {
    _isMock: true,
    account: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
    },
};

describe('account-resolver', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearAccountCache();
        // Default: tenant context returns a mock PrismaClient
        mockGetStore.mockReturnValue(mockTenantDb);
        mockGetMainPrisma.mockReturnValue({ _isMain: true });
        // Default: no tenant ID in context (tests use patterns only)
        mockGetTenantIdFromContext.mockReturnValue(undefined);
    });

    describe('resolveAccount', () => {
        it('resolves account by exact code match (Kiyowo format)', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-ar-1',
                code: '11210',
                name: 'Accounts Receivable',
            } as never);

            const result = await resolveAccount('accounts-receivable');

            expect(result).toEqual({ id: 'acc-ar-1', code: '11210', name: 'Accounts Receivable' });
            expect(prisma.account.findUnique).toHaveBeenCalledWith({ where: { code: '11210' } });
        });

        it('falls back to name pattern when code not found', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null); // code match fails
            vi.mocked(prisma.account.findFirst).mockResolvedValue({
                id: 'acc-melindo-ar',
                code: '1-115b',
                name: 'Piutang Dagang Rafia',
            } as never);

            const result = await resolveAccount('accounts-receivable');

            expect(result).toEqual({ id: 'acc-melindo-ar', code: '1-115b', name: 'Piutang Dagang Rafia' });
            expect(prisma.account.findFirst).toHaveBeenCalledWith({
                where: { name: { contains: 'Piutang Dagang', mode: 'insensitive' } }
            });
        });

        it('throws with descriptive error when no account found', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

            await expect(resolveAccount('nonexistent-role' as never)).rejects.toThrow(
                'Unknown account role: nonexistent-role'
            );
        });

        it('throws when all patterns exhausted for valid role', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

            await expect(resolveAccount('accounts-receivable')).rejects.toThrow(
                'Account not found for role "accounts-receivable"'
            );
        });

        it('caches resolved account for subsequent calls', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-ar-1',
                code: '11210',
                name: 'Accounts Receivable',
            } as never);

            // First call — hits DB
            await resolveAccount('accounts-receivable');
            // Second call — should use cache
            await resolveAccount('accounts-receivable');

            // findUnique called only once (first call), cached for second
            expect(prisma.account.findUnique).toHaveBeenCalledTimes(1);
        });

        it('clears cache on clearAccountCache()', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-ar-1',
                code: '11210',
                name: 'Accounts Receivable',
            } as never);

            await resolveAccount('accounts-receivable');
            clearAccountCache();
            await resolveAccount('accounts-receivable');

            // After clear, cache miss → DB hit again
            expect(prisma.account.findUnique).toHaveBeenCalledTimes(2);
        });

        it('does not share cache between different tenant contexts', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-kiyowo-33000',
                code: '33000',
                name: 'Current Year Earnings',
            } as never);

            // Simulate Kiyowo tenant context
            const kiyowoDb = { _kiyowo: true };
            mockGetStore.mockReturnValue(kiyowoDb);
            await resolveAccount('current-year-earnings');

            // Simulate Melindo tenant context with different DB
            const melindoDb = { _melindo: true };
            mockGetStore.mockReturnValue(melindoDb);
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.account.findFirst).mockResolvedValue({
                id: 'acc-melindo-3-201b',
                code: '3-201b',
                name: 'Laba Tahun Berjalan',
            } as never);

            const result = await resolveAccount('current-year-earnings');

            // Melindo should get its own account, not Kiyowo's
            expect(result).toEqual({ id: 'acc-melindo-3-201b', code: '3-201b', name: 'Laba Tahun Berjalan' });
            // DB was queried again (not cached from Kiyowo)
            expect(prisma.account.findFirst).toHaveBeenCalled();
        });

        it('resolves Melindo AR by exact code (1-115b)', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-melindo-ar',
                code: '1-115b',
                name: 'Piutang Dagang Rafia',
            } as never);

            const result = await resolveAccount('accounts-receivable');

            expect(result).toEqual({ id: 'acc-melindo-ar', code: '1-115b', name: 'Piutang Dagang Rafia' });
            expect(prisma.account.findUnique).toHaveBeenCalledWith({ where: { code: '11210' } });
        });

        it('resolves new role factory-electricity by code', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-electricity',
                code: '53200',
                name: 'Factory Electricity',
            } as never);

            const result = await resolveAccount('factory-electricity');

            expect(result).toEqual({ id: 'acc-electricity', code: '53200', name: 'Factory Electricity' });
        });

        it('resolves new role other-payables by Melindo code (2-390)', async () => {
            vi.mocked(prisma.account.findUnique)
                .mockResolvedValueOnce(null) // 21120 not found
                .mockResolvedValueOnce({
                    id: 'acc-melindo-hutang',
                    code: '2-390',
                    name: 'Hutang ke Nugroho',
                } as never);

            const result = await resolveAccount('other-payables');

            expect(result).toEqual({ id: 'acc-melindo-hutang', code: '2-390', name: 'Hutang ke Nugroho' });
        });

        it('prefers TenantAccountRole DB mapping over patterns when tenantId is set', async () => {
            mockGetTenantIdFromContext.mockReturnValue('tenant-melindo');
            const findUniqueMain = vi.fn().mockResolvedValue({
                accountId: 'acc-db-mapped',
                role: 'accounts-receivable',
                tenantId: 'tenant-melindo',
            });
            mockGetMainPrisma.mockReturnValue({
                tenantAccountRole: { findUnique: findUniqueMain },
            });
            mockTenantDb.account.findUnique.mockResolvedValue({
                id: 'acc-db-mapped',
                code: '1-115b',
                name: 'Piutang Dagang Rafia',
                isActive: true,
            });

            const result = await resolveAccount('accounts-receivable');

            expect(result).toEqual({
                id: 'acc-db-mapped',
                code: '1-115b',
                name: 'Piutang Dagang Rafia',
            });
            expect(findUniqueMain).toHaveBeenCalledWith({
                where: { tenantId_role: { tenantId: 'tenant-melindo', role: 'accounts-receivable' } },
            });
            // Pattern path should not be needed
            expect(prisma.account.findUnique).not.toHaveBeenCalled();
        });

        it('falls back to patterns when DB mapping points to missing account (orphan)', async () => {
            mockGetTenantIdFromContext.mockReturnValue('tenant-melindo');
            mockGetMainPrisma.mockReturnValue({
                tenantAccountRole: {
                    findUnique: vi.fn().mockResolvedValue({
                        accountId: 'deleted-acc',
                        role: 'accounts-receivable',
                    }),
                },
            });
            mockTenantDb.account.findUnique.mockResolvedValue(null);
            // Pattern fallback uses prisma proxy mock
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-pattern',
                code: '11210',
                name: 'Accounts Receivable',
            } as never);

            const result = await resolveAccount('accounts-receivable');

            expect(result.id).toBe('acc-pattern');
        });
    });
});
