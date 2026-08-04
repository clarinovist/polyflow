import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetTenantIdFromContext, mockGetMainPrisma } = vi.hoisted(() => ({
    mockGetTenantIdFromContext: vi.fn(),
    mockGetMainPrisma: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: unknown) => fn,
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        account: { findUnique: vi.fn(), findMany: vi.fn() },
    },
    getMainPrisma: mockGetMainPrisma,
    getTenantIdFromContext: mockGetTenantIdFromContext,
}));

vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess: vi.fn(),
    requireFinanceMutation: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

import { prisma } from '@/lib/core/prisma';
import {
    requireFinanceAccess,
    requireFinanceMutation,
} from '@/lib/auth/finance-access';
import {
    createRevenueRule,
    updateRevenueRule,
    deleteRevenueRule,
    getRevenueRules,
} from '../revenue-rules';

const activeRevenueAccount = {
    id: 'acc-41100',
    code: '41100',
    name: 'Sales Revenue',
    type: 'REVENUE',
    isActive: true,
};

describe('revenue-rules actions', () => {
    let tenantRevenueRule: {
        findMany: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetTenantIdFromContext.mockReturnValue('tenant-1');
        tenantRevenueRule = {
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            findFirst: vi.fn(),
        };
        mockGetMainPrisma.mockReturnValue({ tenantRevenueRule });
        vi.mocked(prisma.account.findUnique).mockResolvedValue(
            activeRevenueAccount as never,
        );
        vi.mocked(requireFinanceMutation as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            undefined,
        );
        vi.mocked(requireFinanceAccess as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
            undefined,
        );
    });

    describe('createRevenueRule', () => {
        it('rejects unknown matchType via Zod', async () => {
            const result = await createRevenueRule({
                matchType: 'CONTAINS',
                matchValue: 'Super',
                accountCode: '41100',
                priority: 10,
            });

            expect(result.success).toBe(false);
            expect(tenantRevenueRule.create).not.toHaveBeenCalled();
        });

        it('trims and requires non-empty matchValue', async () => {
            const result = await createRevenueRule({
                matchType: 'VARIANT_NAME_CONTAINS',
                matchValue: '   ',
                accountCode: '41100',
                priority: 10,
            });

            expect(result.success).toBe(false);
            expect(tenantRevenueRule.create).not.toHaveBeenCalled();
        });

        it('rejects priority outside 0-10000 and non-integers', async () => {
            const negative = await createRevenueRule({
                matchType: 'VARIANT_NAME_CONTAINS',
                matchValue: 'Super',
                accountCode: '41100',
                priority: -1,
            });
            const tooHigh = await createRevenueRule({
                matchType: 'VARIANT_NAME_CONTAINS',
                matchValue: 'Super',
                accountCode: '41100',
                priority: 50000,
            });
            const fractional = await createRevenueRule({
                matchType: 'VARIANT_NAME_CONTAINS',
                matchValue: 'Super',
                accountCode: '41100',
                priority: 5.5,
            });

            expect(negative.success).toBe(false);
            expect(tooHigh.success).toBe(false);
            expect(fractional.success).toBe(false);
            expect(tenantRevenueRule.create).not.toHaveBeenCalled();
        });

        it('rejects account that is inactive or not a REVENUE account', async () => {
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                ...activeRevenueAccount,
                isActive: false,
            } as never);
            const inactive = await createRevenueRule({
                matchType: 'VARIANT_NAME_CONTAINS',
                matchValue: 'Super',
                accountCode: '41100',
                priority: 10,
            });
            expect(inactive.success).toBe(false);

            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                ...activeRevenueAccount,
                type: 'EXPENSE',
            } as never);
            const wrongType = await createRevenueRule({
                matchType: 'VARIANT_NAME_CONTAINS',
                matchValue: 'Super',
                accountCode: '61100',
                priority: 10,
            });
            expect(wrongType.success).toBe(false);
        });

        it('creates rule scoped to current tenant on main DB', async () => {
            tenantRevenueRule.create.mockResolvedValue({
                id: 'rule-1',
                tenantId: 'tenant-1',
                matchType: 'VARIANT_NAME_CONTAINS',
                matchValue: 'Super',
                accountCode: '41100',
                priority: 10,
            });

            const result = await createRevenueRule({
                matchType: 'VARIANT_NAME_CONTAINS',
                matchValue: 'Super',
                accountCode: '41100',
                priority: 10,
            });

            expect(result.success).toBe(true);
            expect(tenantRevenueRule.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    tenantId: 'tenant-1',
                    matchType: 'VARIANT_NAME_CONTAINS',
                    matchValue: 'Super',
                    accountId: 'acc-41100',
                    accountCode: '41100',
                    priority: 10,
                }),
            });
        });

        it('uses default priority 100 when omitted', async () => {
            tenantRevenueRule.create.mockResolvedValue({
                id: 'rule-1',
                tenantId: 'tenant-1',
            });

            await createRevenueRule({
                matchType: 'SKU_PREFIX',
                matchValue: 'RAF-',
                accountCode: '41100',
            });

            expect(tenantRevenueRule.create).toHaveBeenCalledWith({
                data: expect.objectContaining({ priority: 100 }),
            });
        });
    });

    describe('updateRevenueRule', () => {
        it('checks tenant ownership before update (cross-tenant ID rejected)', async () => {
            tenantRevenueRule.findFirst.mockResolvedValue(null);

            const result = await updateRevenueRule('rule-other-tenant', {
                isActive: false,
            });

            expect(result.success).toBe(false);
            expect(tenantRevenueRule.findFirst).toHaveBeenCalledWith({
                where: { id: 'rule-other-tenant', tenantId: 'tenant-1' },
            });
            expect(tenantRevenueRule.update).not.toHaveBeenCalled();
        });

        it('toggles isActive without deleting audit history', async () => {
            tenantRevenueRule.findFirst.mockResolvedValue({
                id: 'rule-1',
                tenantId: 'tenant-1',
            });
            tenantRevenueRule.update.mockResolvedValue({ id: 'rule-1' });

            const result = await updateRevenueRule('rule-1', { isActive: false });

            expect(result.success).toBe(true);
            expect(tenantRevenueRule.update).toHaveBeenCalledWith({
                where: { id: 'rule-1' },
                data: { isActive: false },
            });
        });

        it('re-validates account type when accountCode changes', async () => {
            tenantRevenueRule.findFirst.mockResolvedValue({
                id: 'rule-1',
                tenantId: 'tenant-1',
            });
            vi.mocked(prisma.account.findUnique).mockResolvedValue({
                ...activeRevenueAccount,
                isActive: false,
            } as never);

            const result = await updateRevenueRule('rule-1', {
                accountCode: '41100',
            });

            expect(result.success).toBe(false);
            expect(tenantRevenueRule.update).not.toHaveBeenCalled();
        });
    });

    describe('deleteRevenueRule', () => {
        it('checks tenant ownership before delete (cross-tenant ID rejected)', async () => {
            tenantRevenueRule.findFirst.mockResolvedValue(null);

            const result = await deleteRevenueRule('rule-other-tenant');

            expect(result.success).toBe(false);
            expect(tenantRevenueRule.delete).not.toHaveBeenCalled();
        });

        it('deletes an owned rule', async () => {
            tenantRevenueRule.findFirst.mockResolvedValue({
                id: 'rule-1',
                tenantId: 'tenant-1',
            });
            tenantRevenueRule.delete.mockResolvedValue({ id: 'rule-1' });

            const result = await deleteRevenueRule('rule-1');

            expect(result.success).toBe(true);
            expect(tenantRevenueRule.delete).toHaveBeenCalledWith({
                where: { id: 'rule-1' },
            });
        });
    });

    describe('getRevenueRules', () => {
        it('reads rules for current tenant from main DB', async () => {
            tenantRevenueRule.findMany.mockResolvedValue([]);

            const result = await getRevenueRules();

            expect(result.success).toBe(true);
            expect(tenantRevenueRule.findMany).toHaveBeenCalledWith({
                where: { tenantId: 'tenant-1' },
                orderBy: { priority: 'asc' },
            });
        });
    });
});
