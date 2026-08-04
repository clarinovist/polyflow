import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetMainPrisma } = vi.hoisted(() => ({
    mockGetMainPrisma: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    getMainPrisma: mockGetMainPrisma,
}));

vi.mock('../coa-seed-service', () => ({
    seedTenantAccountRoles: vi.fn(),
}));

import { seedTenantAccountRoles } from '../coa-seed-service';
import {
    auditRequiredAccounts,
    fixMissingAccounts,
    REQUIRED_OPERATIONAL_ROLES,
} from '../coa-integrity-service';

function makeTenantDb() {
    return {
        account: {
            findUnique: vi.fn(),
            createMany: vi.fn(),
        },
    };
}

describe('coa-integrity-service', () => {
    let tenantDb: ReturnType<typeof makeTenantDb>;
    let findMany: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        tenantDb = makeTenantDb();
        findMany = vi.fn();
        mockGetMainPrisma.mockReturnValue({
            tenantAccountRole: { findMany },
        });
    });

    describe('auditRequiredAccounts', () => {
        it('passes Kiyowo and Melindo mappings when semantic mappings are valid', async () => {
            const kiyowoRoles = [
                'accounts-receivable',
                'accounts-payable',
                'sales-revenue',
                'cogs',
            ];
            const melindoRoles = [
                'inventory',
                'raw-material',
                'wip',
                'finished-goods',
                'packaging',
                'scrap',
                'vat-output',
                'vat-input',
                'adjustment-gain',
                'adjustment-loss',
                'manufacturing-overhead',
                'current-year-earnings',
            ];

            const mappings = [
                ...kiyowoRoles.map((role, i) => ({
                    id: `m-${i}`,
                    tenantId: 't1',
                    role,
                    accountId: `acc-k-${role}`,
                    accountCode: role === 'accounts-receivable' ? '11210' : '41100',
                    accountName: role,
                })),
                ...melindoRoles.map((role, i) => ({
                    id: `m-m-${i}`,
                    tenantId: 't1',
                    role,
                    accountId: `acc-m-${role}`,
                    accountCode:
                        role === 'cogs'
                            ? '5-001'
                            : role === 'sales-revenue'
                              ? '4-1000'
                              : '1-130',
                    accountName: role,
                })),
            ];
            findMany.mockResolvedValue(mappings);

            (tenantDb.account.findUnique as ReturnType<typeof vi.fn>).mockImplementation(
                async ({ where }: { where: { id: string } }) => ({
                    id: where.id,
                    code: where.id.startsWith('acc-k-')
                        ? where.id === 'acc-k-accounts-receivable'
                            ? '11210'
                            : '41100'
                        : '1-130',
                    name: 'Live',
                    isActive: true,
                }),
            );

            const items = await auditRequiredAccounts('t1', tenantDb as never);

            expect(items).toHaveLength(REQUIRED_OPERATIONAL_ROLES.length);
            expect(items.every((i) => i.status === 'OK')).toBe(true);
            expect(items.find((i) => i.role === 'accounts-receivable')?.liveCode).toBe(
                '11210',
            );
        });

        it('reports MISSING for roles with no mapping', async () => {
            findMany.mockResolvedValue([]);

            const items = await auditRequiredAccounts('t1', tenantDb as never);

            expect(items).toHaveLength(REQUIRED_OPERATIONAL_ROLES.length);
            expect(items.every((i) => i.status === 'MISSING')).toBe(true);
        });

        it('reports ORPHAN when mapped account does not exist in tenant DB', async () => {
            findMany.mockResolvedValue([
                {
                    id: 'm1',
                    tenantId: 't1',
                    role: 'sales-revenue',
                    accountId: 'acc-gone',
                    accountCode: '4-1000',
                    accountName: 'PENDAPATAN USAHA',
                },
            ]);
            (tenantDb.account.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
                null,
            );

            const items = await auditRequiredAccounts('t1', tenantDb as never);

            const rev = items.find((i) => i.role === 'sales-revenue');
            expect(rev?.status).toBe('ORPHAN');
            expect(rev?.mappedCode).toBe('4-1000');
        });

        it('reports INACTIVE when mapped account is inactive', async () => {
            findMany.mockResolvedValue([
                {
                    id: 'm1',
                    tenantId: 't1',
                    role: 'cogs',
                    accountId: 'acc-inactive',
                    accountCode: '5-001',
                    accountName: 'HPP',
                },
            ]);
            (tenantDb.account.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
                id: 'acc-inactive',
                code: '5-001',
                name: 'HPP',
                isActive: false,
            });

            const items = await auditRequiredAccounts('t1', tenantDb as never);

            const cogs = items.find((i) => i.role === 'cogs');
            expect(cogs?.status).toBe('INACTIVE');
            expect(cogs?.liveCode).toBe('5-001');
        });
    });

    describe('fixMissingAccounts', () => {
        it('delegates to seedTenantAccountRoles create-only and reports unresolved roles', async () => {
            vi.mocked(seedTenantAccountRoles).mockResolvedValue({
                created: 2,
                skipped: 0,
                updated: 0,
                failed: [],
            });
            // sales-revenue mapped, everything else unmapped
            findMany.mockResolvedValue([
                {
                    id: 'm1',
                    tenantId: 't1',
                    role: 'sales-revenue',
                    accountId: 'acc-rev',
                    accountCode: '4-1000',
                    accountName: 'PENDAPATAN USAHA',
                },
            ]);
            (tenantDb.account.findUnique as ReturnType<typeof vi.fn>).mockImplementation(
                async ({ where }: { where: { id: string } }) =>
                    where.id === 'acc-rev'
                        ? {
                              id: 'acc-rev',
                              code: '4-1000',
                              name: 'PENDAPATAN USAHA',
                              isActive: true,
                          }
                        : null,
            );

            const result = await fixMissingAccounts('t1', tenantDb as never);

            expect(seedTenantAccountRoles).toHaveBeenCalledWith({
                tenantId: 't1',
                tenantDb,
                force: false,
            });
            expect(result.created).toBe(2);
            expect(result.unresolved.length).toBeGreaterThan(0);
            expect(result.unresolved.every((i) => i.status !== 'OK')).toBe(true);
        });

        it('never calls account.createMany (mappings only, no ghost accounts)', async () => {
            vi.mocked(seedTenantAccountRoles).mockResolvedValue({
                created: 0,
                skipped: 0,
                updated: 0,
                failed: [],
            });
            findMany.mockResolvedValue([]);
            (tenantDb.account.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
                null,
            );

            await fixMissingAccounts('t1', tenantDb as never);

            expect(tenantDb.account.createMany).not.toHaveBeenCalled();
        });
    });
});
