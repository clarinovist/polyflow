import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mocks — must be before imports
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        customerProductPrice: {
            count: vi.fn().mockResolvedValue(0),
            findMany: vi.fn().mockResolvedValue([]),
            upsert: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
        },
        productVariant: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        $transaction: vi.fn(async (cb: unknown) => {
            if (typeof cb === 'function') {
                const tx = {
                    customerProductPrice: {
                        upsert: vi.fn().mockResolvedValue({}),
                        update: vi.fn().mockResolvedValue({}),
                    },
                };
                return (cb as (t: typeof tx) => unknown)(tx as never);
            }
            return cb;
        }),
    },
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn().mockResolvedValue({ user: { id: 'u1', role: 'ADMIN', roles: ['ADMIN'] } }),
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn().mockResolvedValue({ user: { id: 'u1', role: 'SALES', roles: ['SALES'] } }),
    requireSalesManager: vi.fn().mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN', roles: ['ADMIN'] } }),
}));

import { prisma } from '@/lib/core/prisma';
import { requireSalesAccess, requireSalesManager } from '@/lib/auth/sales-access';
import {
    listCustomerProductPricesAction,
    bulkUpsertCustomerProductPricesAction,
    previewBulkAdjustPricesAction,
    applyBulkAdjustPricesAction,
    bulkAdjustCustomerProductPricesAction,
    upsertSinglePriceAction,
} from '../price-list';

describe('price-list actions — guards', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.customerProductPrice.count).mockResolvedValue(0);
        vi.mocked(prisma.customerProductPrice.findMany).mockResolvedValue([] as never);
        vi.mocked(requireSalesAccess).mockResolvedValue({ user: { id: 'sales-1', role: 'SALES', roles: ['SALES'] } } as never);
        vi.mocked(requireSalesManager).mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN', roles: ['ADMIN'] } } as never);
    });

    describe('listCustomerProductPricesAction — read guard requireSalesAccess', () => {
        it('allows SALES to read', async () => {
            const res = await listCustomerProductPricesAction({ page: 1, pageSize: 10 });
            expect(res.success).toBe(true);
            expect(requireSalesAccess).toHaveBeenCalled();
        });

        it('rejects when requireSalesAccess throws (e.g., WAREHOUSE)', async () => {
            const { BusinessRuleError } = await import('@/lib/errors/errors');
            vi.mocked(requireSalesAccess).mockRejectedValue(
                new BusinessRuleError('Unauthorized: Akses sales hanya untuk admin atau sales.'),
            );
            const res = await listCustomerProductPricesAction({ page: 1 }) as { success: boolean; error?: string };
            expect(res.success).toBe(false);
            expect(res.error).toMatch(/Unauthorized/);
        });

        it('returns empty when no data', async () => {
            vi.mocked(prisma.customerProductPrice.count).mockResolvedValue(0);
            vi.mocked(prisma.customerProductPrice.findMany).mockResolvedValue([] as never);
            const res = await listCustomerProductPricesAction({});
            expect(res.success).toBe(true);
        });
    });

    describe('previewBulkAdjustPricesAction — read guard only (dry-run)', () => {
        it('allows SALES read for preview', async () => {
            vi.mocked(prisma.customerProductPrice.findMany).mockResolvedValue([
                { id: 'p1', customerId: 'c1', productVariantId: 'pv1', unitPrice: { toNumber: () => 10000 } as never, customer: { name: 'A' }, productVariant: { name: 'Prod', skuCode: 'SKU-1' } },
            ] as never);
            const res = await previewBulkAdjustPricesAction({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 10,
            });
            expect(res.success).toBe(true);
            expect(requireSalesAccess).toHaveBeenCalled();
        });

        it('rejects preview when unauth', async () => {
            const { BusinessRuleError } = await import('@/lib/errors/errors');
            vi.mocked(requireSalesAccess).mockRejectedValue(new BusinessRuleError('Unauthorized'));
            const res = await previewBulkAdjustPricesAction({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 10,
            }) as { success: boolean };
            expect(res.success).toBe(false);
        });
    });

    describe('bulkUpsert — manager guard ADMIN+MARKETING, SALES rejected', () => {
        it('allows ADMIN/MARKETING (requireSalesManager)', async () => {
            const res = await bulkUpsertCustomerProductPricesAction({
                entries: [{ customerId: 'c1', productVariantId: 'pv1', price: 10000 }],
            });
            expect(res.success).toBe(true);
            expect(requireSalesManager).toHaveBeenCalled();
        });

        it('rejects SALES-only when trying to bulk upsert', async () => {
            const { BusinessRuleError } = await import('@/lib/errors/errors');
            vi.mocked(requireSalesManager).mockRejectedValue(
                new BusinessRuleError('Unauthorized: Hanya admin atau marketing yang dapat melakukan aksi ini.'),
            );
            const res = await bulkUpsertCustomerProductPricesAction({
                entries: [{ customerId: 'c1', productVariantId: 'pv1', price: 10000 }],
            }) as { success: boolean; error?: string };
            expect(res.success).toBe(false);
            expect(res.error).toMatch(/Unauthorized/);
        });
    });

    describe('applyBulkAdjust — manager guard, SALES rejected', () => {
        it('allows manager to apply', async () => {
            vi.mocked(prisma.customerProductPrice.findMany).mockResolvedValue([
                { id: 'p1', customerId: 'c1', productVariantId: 'pv1', unitPrice: { toNumber: () => 10000 } as never, customer: { name: 'A' }, productVariant: { name: 'Prod', skuCode: 'SKU-1' } },
            ] as never);
            const res = await applyBulkAdjustPricesAction({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 10,
            });
            expect(res.success).toBe(true);
            expect(requireSalesManager).toHaveBeenCalled();
        });

        it('rejects SALES when trying to apply bulk adjust', async () => {
            const { BusinessRuleError } = await import('@/lib/errors/errors');
            vi.mocked(requireSalesManager).mockRejectedValue(
                new BusinessRuleError('Unauthorized: Hanya admin atau marketing yang dapat melakukan aksi ini.'),
            );
            const res = await applyBulkAdjustPricesAction({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 10,
            }) as { success: boolean; error?: string };
            expect(res.success).toBe(false);
            expect(res.error).toMatch(/Unauthorized/);
        });
    });

    describe('bulkAdjust unified — dryRun vs non-dryRun guard split', () => {
        it('dryRun true uses requireSalesAccess only', async () => {
            vi.mocked(prisma.customerProductPrice.findMany).mockResolvedValue([
                { id: 'p1', customerId: 'c1', productVariantId: 'pv1', unitPrice: { toNumber: () => 5000 } as never, customer: { name: 'A' }, productVariant: { name: 'Prod', skuCode: 'SKU-1' } },
            ] as never);
            const res = await bulkAdjustCustomerProductPricesAction({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 5,
                dryRun: true,
            });
            expect(res.success).toBe(true);
            expect(requireSalesAccess).toHaveBeenCalled();
        });

        it('dryRun false uses requireSalesManager', async () => {
            vi.mocked(prisma.customerProductPrice.findMany).mockResolvedValue([
                { id: 'p1', customerId: 'c1', productVariantId: 'pv1', unitPrice: { toNumber: () => 5000 } as never, customer: { name: 'A' }, productVariant: { name: 'Prod', skuCode: 'SKU-1' } },
            ] as never);
            const res = await bulkAdjustCustomerProductPricesAction({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 5,
                dryRun: false,
            });
            expect(res.success).toBe(true);
            expect(requireSalesManager).toHaveBeenCalled();
        });

        it('dryRun false rejects SALES', async () => {
            const { BusinessRuleError } = await import('@/lib/errors/errors');
            vi.mocked(requireSalesManager).mockRejectedValue(new BusinessRuleError('Unauthorized'));
            const res = await bulkAdjustCustomerProductPricesAction({
                filter: { customerId: 'c1' },
                mode: 'PERCENT',
                value: 5,
                dryRun: false,
            }) as { success: boolean };
            expect(res.success).toBe(false);
        });
    });

    describe('upsertSinglePriceAction — manager guard', () => {
        it('allows manager', async () => {
            const res = await upsertSinglePriceAction({
                customerId: 'c1',
                productVariantId: 'pv1',
                price: 12000,
            });
            expect(res.success).toBe(true);
        });

        it('rejects SALES attempt (SALES only page cannot write via price-list, only via old path with salesAccess)', async () => {
            const { BusinessRuleError } = await import('@/lib/errors/errors');
            vi.mocked(requireSalesManager).mockRejectedValue(new BusinessRuleError('Unauthorized: Hanya admin atau marketing yang dapat melakukan aksi ini.'));
            const res = await upsertSinglePriceAction({
                customerId: 'c1',
                productVariantId: 'pv1',
                price: 12000,
            }) as { success: boolean; error?: string };
            expect(res.success).toBe(false);
            expect(res.error).toMatch(/Unauthorized/);
        });
    });
});
