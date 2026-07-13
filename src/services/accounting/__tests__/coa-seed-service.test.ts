import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetMainPrisma, mockResolveByPatterns, mockGetAllAccountRoles, mockClearAccountCache } = vi.hoisted(() => ({
    mockGetMainPrisma: vi.fn(),
    mockResolveByPatterns: vi.fn(),
    mockGetAllAccountRoles: vi.fn(),
    mockClearAccountCache: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: mockGetMainPrisma,
}));

vi.mock('../account-resolver', () => ({
    resolveByPatterns: mockResolveByPatterns,
    getAllAccountRoles: mockGetAllAccountRoles,
    clearAccountCache: mockClearAccountCache,
}));

import { seedTenantAccountRoles, updateRoleMapping } from '../coa-seed-service';

describe('coa-seed-service', () => {
    const tenantDb = {
        account: {
            findUnique: vi.fn(),
        },
    } as never;

    let create: ReturnType<typeof vi.fn>;
    let update: ReturnType<typeof vi.fn>;
    let findMany: ReturnType<typeof vi.fn>;
    let upsert: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        create = vi.fn();
        update = vi.fn();
        findMany = vi.fn();
        upsert = vi.fn();
        mockGetMainPrisma.mockReturnValue({
            tenantAccountRole: { create, update, findMany, upsert, findUnique: vi.fn() },
        });
        mockGetAllAccountRoles.mockReturnValue(['accounts-receivable', 'bank-bca', 'factory-electricity']);
    });

    describe('seedTenantAccountRoles', () => {
        it('create-only: skips existing mappings and creates missing ones', async () => {
            findMany.mockResolvedValue([
                { id: 'm1', role: 'accounts-receivable', accountId: 'a1' },
            ]);
            mockResolveByPatterns.mockImplementation(async (role: string) => ({
                id: `id-${role}`,
                code: `code-${role}`,
                name: role,
            }));

            const result = await seedTenantAccountRoles({
                tenantId: 't1',
                tenantDb,
                force: false,
            });

            expect(result.skipped).toBe(1);
            expect(result.created).toBe(2);
            expect(result.updated).toBe(0);
            expect(create).toHaveBeenCalledTimes(2);
            expect(update).not.toHaveBeenCalled();
            expect(mockClearAccountCache).toHaveBeenCalled();
        });

        it('force: updates existing mappings', async () => {
            findMany.mockResolvedValue([
                { id: 'm1', role: 'accounts-receivable', accountId: 'old' },
            ]);
            mockResolveByPatterns.mockResolvedValue({
                id: 'new-id',
                code: '11210',
                name: 'AR',
            });

            const result = await seedTenantAccountRoles({
                tenantId: 't1',
                tenantDb,
                force: true,
            });

            expect(result.updated).toBeGreaterThanOrEqual(1);
            expect(update).toHaveBeenCalled();
            expect(mockClearAccountCache).toHaveBeenCalled();
        });

        it('records failed roles when pattern resolve throws', async () => {
            findMany.mockResolvedValue([]);
            mockResolveByPatterns.mockRejectedValue(new Error('not found'));

            const result = await seedTenantAccountRoles({
                tenantId: 't1',
                tenantDb,
                force: false,
            });

            expect(result.created).toBe(0);
            expect(result.failed).toEqual([
                'accounts-receivable',
                'bank-bca',
                'factory-electricity',
            ]);
        });
    });

    describe('updateRoleMapping', () => {
        it('rejects unknown roles', async () => {
            await expect(
                updateRoleMapping('t1', 'not-a-real-role', 'acc-1', tenantDb),
            ).rejects.toThrow('Unknown account role');
        });

        it('rejects missing account', async () => {
            (tenantDb as { account: { findUnique: ReturnType<typeof vi.fn> } }).account.findUnique
                .mockResolvedValue(null);

            await expect(
                updateRoleMapping('t1', 'accounts-receivable', 'acc-missing', tenantDb),
            ).rejects.toThrow('Account');
        });

        it('upserts valid mapping and clears cache', async () => {
            (tenantDb as { account: { findUnique: ReturnType<typeof vi.fn> } }).account.findUnique
                .mockResolvedValue({
                    id: 'acc-1',
                    code: '11210',
                    name: 'AR',
                    isActive: true,
                });

            await updateRoleMapping('t1', 'accounts-receivable', 'acc-1', tenantDb);

            expect(upsert).toHaveBeenCalled();
            expect(mockClearAccountCache).toHaveBeenCalled();
        });
    });
});
