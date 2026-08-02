import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesMarginAccess: vi.fn().mockResolvedValue({
        user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
    }),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/errors/errors', async () => {
    const actual = (await vi.importActual('@/lib/errors/errors')) as any;
    return {
        ...actual,
        safeAction: async (fn: () => Promise<unknown>) => {
            try {
                const data = await fn();
                return { success: true, data };
            } catch (e) {
                const err = e as any;
                return {
                    success: false,
                    error: err.message ?? String(err),
                    code: err.code ?? 'UNKNOWN',
                };
            }
        },
    };
});

vi.mock('@/services/sales/margin-report-service', () => ({
    getMarginReport: vi.fn().mockResolvedValue({
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        summary: {
            totalRevenue: new Decimal(0),
            totalCost: new Decimal(0),
            totalMargin: new Decimal(0),
            marginPercent: null,
            totalOrders: 0,
            totalCustomerCount: 0,
            ordersWithIncompleteHpp: 0,
            ordersWithNoHpp: 0,
            variantWithoutHppCount: 0,
        },
        orders: [],
        byCustomer: [],
        byProduct: [],
        bySales: [],
        hppMap: new Map(),
        variantWithoutHpp: [],
    }),
}));

import { getSalesMarginReport } from '../margin-report';
import { requireSalesMarginAccess } from '@/lib/auth/sales-access';
import { getMarginReport } from '@/services/sales/margin-report-service';
import { BusinessRuleError } from '@/lib/errors/errors';

describe('margin-report actions — guard ADMIN/MARKETING/FINANCE only', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireSalesMarginAccess).mockResolvedValue({
            user: { id: 'admin', role: 'ADMIN', roles: ['ADMIN'] },
        } as any);
    });

    it('ADMIN lolos guard dan mengembalikan data', async () => {
        // Act
        const result = await getSalesMarginReport(new Date('2026-08-01'), new Date('2026-08-31'));

        // Assert
        expect(result.success).toBe(true);
        expect(requireSalesMarginAccess).toHaveBeenCalledTimes(1);
        expect(getMarginReport).toHaveBeenCalledTimes(1);
    });

    it('MARKETING lolos guard', async () => {
        // Arrange
        vi.mocked(requireSalesMarginAccess).mockResolvedValue({
            user: { id: 'mkt-1', role: 'MARKETING', roles: ['MARKETING'] },
        } as any);

        // Act
        const result = await getSalesMarginReport();

        // Assert
        expect(result.success).toBe(true);
        expect(requireSalesMarginAccess).toHaveBeenCalledTimes(1);
    });

    it('FINANCE lolos guard', async () => {
        // Arrange
        vi.mocked(requireSalesMarginAccess).mockResolvedValue({
            user: { id: 'fin-1', role: 'FINANCE', roles: ['FINANCE'] },
        } as any);

        // Act
        const result = await getSalesMarginReport();

        // Assert
        expect(result.success).toBe(true);
        expect(requireSalesMarginAccess).toHaveBeenCalledTimes(1);
    });

    it('SALES biasa ditolak — requireSalesMarginAccess throw BusinessRuleError', async () => {
        // Arrange
        vi.mocked(requireSalesMarginAccess).mockRejectedValue(
            new BusinessRuleError(
                'Unauthorized: Laporan margin hanya untuk admin, marketing, atau finance.',
            ),
        );

        // Act
        const result = await getSalesMarginReport();

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toContain('Laporan margin hanya untuk admin, marketing, atau finance');
        }
    });

    it('WAREHOUSE ditolak', async () => {
        // Arrange
        vi.mocked(requireSalesMarginAccess).mockRejectedValue(
            new BusinessRuleError(
                'Unauthorized: Laporan margin hanya untuk admin, marketing, atau finance.',
            ),
        );

        // Act
        const result = await getSalesMarginReport();

        // Assert
        expect(result.success).toBe(false);
    });

    it('mengonversi hppMap Map ke array serializable', async () => {
        // Arrange
        const hppMap = new Map([
            ['variant-A', { hppPerUnit: new Decimal(10_000), totalQuantity: new Decimal(100) }],
        ]);
        vi.mocked(getMarginReport).mockResolvedValue({
            startDate: new Date('2026-08-01'),
            endDate: new Date('2026-08-31'),
            summary: {
                totalRevenue: new Decimal(1_000_000),
                totalCost: new Decimal(500_000),
                totalMargin: new Decimal(500_000),
                marginPercent: new Decimal(50),
                totalOrders: 1,
                totalCustomerCount: 1,
                ordersWithIncompleteHpp: 0,
                ordersWithNoHpp: 0,
                variantWithoutHppCount: 0,
            },
            orders: [],
            byCustomer: [],
            byProduct: [],
            bySales: [],
            hppMap: hppMap as any,
            variantWithoutHpp: [],
        } as never);

        // Act
        const result = await getSalesMarginReport();

        // Assert
        expect(result.success).toBe(true);
        if (result.success) {
            const data = result.data as any;
            // hppMap must be array, not Map
            expect(Array.isArray(data.hppMap)).toBe(true);
            expect(data.hppMap[0].variantId).toBe('variant-A');
        }
    });
});
