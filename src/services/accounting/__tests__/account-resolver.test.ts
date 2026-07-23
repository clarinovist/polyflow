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
        // Default: non-Melindo tenant. isMelindoTenantDb probes code '1-130'
        // and generic mockResolvedValue would false-positive → ghost-skip all
        // Kiyowo codes. Return null unless a test overrides explicitly.
        vi.mocked(prisma.account.findUnique).mockImplementation((args: any) => {
            const code = args?.where?.code;
            if (code === '1-130') return Promise.resolve(null) as any;
            return Promise.resolve(null) as any;
        });
    });

    describe('resolveAccount', () => {
        it('resolves account by exact code match (Kiyowo format)', async () => {
            vi.mocked(prisma.account.findUnique).mockImplementation((args: any) => {
                const code = args?.where?.code;
                if (code === '11210') return Promise.resolve({
                    id: 'acc-ar-1',
                    code: '11210',
                    name: 'Accounts Receivable',
                } as never);
                return Promise.resolve(null) as any;
            });

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
                where: {
                    name: { contains: 'Piutang Dagang', mode: 'insensitive' },
                    isActive: true,
                },
                orderBy: { code: 'asc' },
            });
        });

        it('throws with descriptive error when no account found', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

            await expect(resolveAccount('nonexistent-role' as never)).rejects.toThrow(/tidak ditemukan/i);
        });

        it('throws when all patterns exhausted for valid role', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue(null);
            vi.mocked(prisma.account.findFirst).mockResolvedValue(null);

            await expect(resolveAccount('accounts-receivable')).rejects.toThrow(/tidak ditemukan/i);
        });

        it('caches resolved account for subsequent calls', async () => {
            vi.mocked(prisma.account.findUnique).mockImplementation((args: any) => {
                const code = args?.where?.code;
                if (code === '11210') return Promise.resolve({
                    id: 'acc-ar-1',
                    code: '11210',
                    name: 'Accounts Receivable',
                } as never);
                return Promise.resolve(null) as any;
            });

            // First call — hits DB
            await resolveAccount('accounts-receivable');
            // Second call — should use cache
            await resolveAccount('accounts-receivable');

            // findUnique called for code '11210' exactly once across both calls
            // (marker probe '1-130' happens on first resolve but is cached per tenant)
            const calls = vi.mocked(prisma.account.findUnique).mock.calls.filter(
                (c: any) => c?.[0]?.where?.code === '11210'
            );
            expect(calls).toHaveLength(1);
        });

        it('clears cache on clearAccountCache()', async () => {
            vi.mocked(prisma.account.findUnique).mockImplementation((args: any) => {
                const code = args?.where?.code;
                if (code === '11210') return Promise.resolve({
                    id: 'acc-ar-1',
                    code: '11210',
                    name: 'Accounts Receivable',
                } as never);
                return Promise.resolve(null) as any;
            });

            await resolveAccount('accounts-receivable');
            clearAccountCache();
            await resolveAccount('accounts-receivable');

            // After clear, cache miss → code '11210' queried again
            const calls = vi.mocked(prisma.account.findUnique).mock.calls.filter(
                (c: any) => c?.[0]?.where?.code === '11210'
            );
            expect(calls).toHaveLength(2);
        });

        it('does not share cache between different tenant contexts', async () => {
            vi.mocked(prisma.account.findUnique).mockImplementation((args: any) => {
                const code = args?.where?.code;
                if (code === '33000') return Promise.resolve({
                    id: 'acc-kiyowo-33000',
                    code: '33000',
                    name: 'Current Year Earnings',
                } as never);
                return Promise.resolve(null) as any;
            });

            // Simulate Kiyowo tenant context
            const kiyowoDb = { _kiyowo: true };
            mockGetStore.mockReturnValue(kiyowoDb);
            await resolveAccount('current-year-earnings');

            // Simulate Melindo tenant context with different DB
            const melindoDb = { _melindo: true };
            mockGetStore.mockReturnValue(melindoDb);
            vi.mocked(prisma.account.findUnique).mockImplementation((args: any) => {
                const code = args?.where?.code;
                if (code === '1-130') return Promise.resolve({
                    id: 'acc-marker',
                    code: '1-130',
                    name: 'Melindo Marker',
                } as never);
                return Promise.resolve(null) as any;
            });
            vi.mocked(prisma.account.findFirst).mockImplementation((args: any) => {
                const name = args?.where?.name?.contains;
                if (name && name.includes('Laba')) return Promise.resolve({
                    id: 'acc-melindo-3-201b',
                    code: '3-201b',
                    name: 'Laba Tahun Berjalan',
                } as never);
                return Promise.resolve(null) as any;
            });

            const result = await resolveAccount('current-year-earnings');

            // Melindo should get its own account, not Kiyowo's
            expect(result).toEqual({ id: 'acc-melindo-3-201b', code: '3-201b', name: 'Laba Tahun Berjalan' });
            // DB was queried again (not cached from Kiyowo)
            expect(prisma.account.findFirst).toHaveBeenCalled();
        });

        it('resolves Melindo AR by exact code (1-115b)', async () => {
            vi.mocked(prisma.account.findUnique).mockImplementation((args: any) => {
                const code = args?.where?.code;
                if (code === '1-115b') return Promise.resolve({
                    id: 'acc-melindo-ar',
                    code: '1-115b',
                    name: 'Piutang Dagang Rafia',
                } as never);
                return Promise.resolve(null) as any;
            });

            const result = await resolveAccount('accounts-receivable');

            expect(result).toEqual({ id: 'acc-melindo-ar', code: '1-115b', name: 'Piutang Dagang Rafia' });
            expect(prisma.account.findUnique).toHaveBeenCalledWith({ where: { code: '11210' } });
        });

        it('resolves new role factory-electricity by code', async () => {
            vi.mocked(prisma.account.findUnique).mockImplementation((args: any) => {
                const code = args?.where?.code;
                if (code === '53200') return Promise.resolve({
                    id: 'acc-electricity',
                    code: '53200',
                    name: 'Factory Electricity',
                } as never);
                return Promise.resolve(null) as any;
            });

            const result = await resolveAccount('factory-electricity');

            expect(result).toEqual({ id: 'acc-electricity', code: '53200', name: 'Factory Electricity' });
        });

        it('resolves other-payables by generic owner pattern (TenantAccountRole preferred)', async () => {
            vi.mocked(prisma.account.findUnique)
                .mockResolvedValueOnce(null) // 21120 not found
                .mockResolvedValueOnce({
                    id: 'acc-owner',
                    code: '2-390',
                    name: 'Hutang Owner',
                } as never);

            const result = await resolveAccount('other-payables');

            expect(result).toEqual({ id: 'acc-owner', code: '2-390', name: 'Hutang Owner' });
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
            vi.mocked(prisma.account.findUnique).mockImplementation((args: any) => {
                const code = args?.where?.code;
                if (code === '11210') return Promise.resolve({
                    id: 'acc-pattern',
                    code: '11210',
                    name: 'Accounts Receivable',
                } as never);
                return Promise.resolve(null) as any;
            });

            const result = await resolveAccount('accounts-receivable');

            expect(result.id).toBe('acc-pattern');
        });

        it('resolves bank-charges by Kiyowo code (91200)', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-bank-charges',
                code: '91200',
                name: 'Bank Charges',
            } as never);

            const result = await resolveAccount('bank-charges');
            expect(result).toEqual({ id: 'acc-bank-charges', code: '91200', name: 'Bank Charges' });
        });

        it('resolves interest-income by Melindo code (7-100)', async () => {
            vi.mocked(prisma.account.findUnique)
                .mockResolvedValueOnce(null) // 81200 not found
                .mockResolvedValueOnce({
                    id: 'acc-melindo-bunga',
                    code: '7-100',
                    name: 'Pendapatan Bunga Bank',
                } as never);

            const result = await resolveAccount('interest-income');
            expect(result).toEqual({ id: 'acc-melindo-bunga', code: '7-100', name: 'Pendapatan Bunga Bank' });
        });

        it('resolves suspense-clearing by Melindo code (1-199)', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                id: 'acc-melindo-sementara',
                code: '1-199',
                name: 'Rekening Sementara',
            } as never);

            const result = await resolveAccount('suspense-clearing');
            expect(result).toEqual({ id: 'acc-melindo-sementara', code: '1-199', name: 'Rekening Sementara' });
        });
    });
});
