import { PurchaseOrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getPurchasingSpendPeriods,
    PURCHASING_SPEND_EXCLUDED_STATUSES,
    readPurchasingDashboardNominalMetrics,
} from '../dashboard-metrics-service';

const mocks = vi.hoisted(() => ({
    aggregate: vi.fn(),
    groupBy: vi.fn(),
    supplier: vi.fn(),
}));

const db = {
    purchaseOrder: {
        aggregate: mocks.aggregate,
        groupBy: mocks.groupBy,
    },
    supplier: { findUnique: mocks.supplier },
};

function sum(totalAmount: number | null) {
    return { _sum: { totalAmount } };
}

describe('purchasing dashboard nominal metrics', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mocks.aggregate
            .mockResolvedValueOnce(sum(12_000))
            .mockResolvedValueOnce(sum(8_000));
        mocks.groupBy.mockResolvedValue([
            { supplierId: 'supplier-a', _sum: { totalAmount: 7_500 } },
        ]);
        mocks.supplier.mockResolvedValue({ name: 'Pemasok Utama' });
    });

    it('uses complete WIB calendar month bounds across year rollover', () => {
        const periods = getPurchasingSpendPeriods(
            new Date('2026-01-01T00:30:00.000Z'),
        );

        expect(periods.current.start.toISOString()).toBe(
            '2025-12-31T17:00:00.000Z',
        );
        expect(periods.current.end.toISOString()).toBe(
            '2026-01-01T16:59:59.999Z',
        );
        expect(periods.previous.start.toISOString()).toBe(
            '2025-11-30T17:00:00.000Z',
        );
        expect(periods.previous.end.toISOString()).toBe(
            '2025-12-31T16:59:59.999Z',
        );
    });

    it('sums orderDate spend from the same non-draft, non-cancelled cohort and ranks by spend', async () => {
        const result = await readPurchasingDashboardNominalMetrics(
            db as never,
            new Date('2026-10-09T03:00:00.000Z'),
        );

        const currentWhere = {
            orderDate: {
                gte: new Date('2026-09-30T17:00:00.000Z'),
                lte: new Date('2026-10-09T16:59:59.999Z'),
            },
            status: {
                notIn: [
                    PurchaseOrderStatus.DRAFT,
                    PurchaseOrderStatus.CANCELLED,
                ],
            },
        };
        expect(PURCHASING_SPEND_EXCLUDED_STATUSES).toEqual([
            PurchaseOrderStatus.DRAFT,
            PurchaseOrderStatus.CANCELLED,
        ]);
        expect(mocks.aggregate.mock.calls[0]?.[0]).toEqual({
            where: currentWhere,
            _sum: { totalAmount: true },
        });
        expect(mocks.aggregate.mock.calls[1]?.[0]).toEqual({
            where: {
                ...currentWhere,
                orderDate: {
                    gte: new Date('2026-08-31T17:00:00.000Z'),
                    lte: new Date('2026-09-30T16:59:59.999Z'),
                },
            },
            _sum: { totalAmount: true },
        });
        expect(mocks.groupBy).toHaveBeenCalledWith({
            by: ['supplierId'],
            where: currentWhere,
            having: { totalAmount: { _sum: { not: null } } },
            _sum: { totalAmount: true },
            orderBy: [
                { _sum: { totalAmount: 'desc' } },
                { supplierId: 'asc' },
            ],
            take: 1,
        });
        expect(result).toEqual({
            monthlySpend: 12_000,
            previousFullMonthSpend: 8_000,
            previousFullMonthChangePercent: 50,
            topSupplierName: 'Pemasok Utama',
            topSupplierSpend: 7_500,
        });
    });

    it('returns not-comparable when the full prior month is zero and keeps zero current spend valid', async () => {
        mocks.aggregate.mockReset();
        mocks.aggregate
            .mockResolvedValueOnce(sum(null))
            .mockResolvedValueOnce(sum(0));

        const result = await readPurchasingDashboardNominalMetrics(
            db as never,
            new Date('2026-10-09T03:00:00.000Z'),
        );

        expect(result.monthlySpend).toBe(0);
        expect(result.previousFullMonthSpend).toBe(0);
        expect(result.previousFullMonthChangePercent).toBeNull();
    });

    it('ranks by summed spend rather than PO count, with a deterministic supplierId tie-break', async () => {
        await readPurchasingDashboardNominalMetrics(
            db as never,
            new Date('2026-10-09T03:00:00.000Z'),
        );

        expect(mocks.groupBy.mock.calls[0]?.[0]).toMatchObject({
            _sum: { totalAmount: true },
            orderBy: [
                { _sum: { totalAmount: 'desc' } },
                { supplierId: 'asc' },
            ],
            take: 1,
        });
        expect(mocks.groupBy.mock.calls[0]?.[0]).not.toHaveProperty('_count');
    });

    it('does not query a supplier name when no eligible supplier aggregate exists', async () => {
        mocks.groupBy.mockResolvedValue([]);

        const result = await readPurchasingDashboardNominalMetrics(
            db as never,
            new Date('2026-10-09T03:00:00.000Z'),
        );

        expect(mocks.supplier).not.toHaveBeenCalled();
        expect(result.topSupplierName).toBeNull();
        expect(result.topSupplierSpend).toBeNull();
    });
});
