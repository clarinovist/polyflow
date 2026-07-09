import { beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so these are available in the hoisted vi.mock factory
const { mockGetStore, mockGetMainPrisma } = vi.hoisted(() => ({
    mockGetStore: vi.fn(),
    mockGetMainPrisma: vi.fn(),
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
}));

import { prisma } from '@/lib/core/prisma';
import { resolveAccount, clearAccountCache } from '../account-resolver';

// Shared mock tenant DB instance
const mockTenantDb = { _isMock: true };

describe('account-resolver', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearAccountCache();
        // Default: tenant context returns a mock PrismaClient
        mockGetStore.mockReturnValue(mockTenantDb);
        mockGetMainPrisma.mockReturnValue({ _isMain: true });
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
    });
});
