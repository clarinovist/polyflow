import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CostReportingService } from '../cost-reporting-service';
import { prisma } from '@/lib/core/prisma';
import { MovementType, ProductionStatus } from '@prisma/client';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: { findUnique: vi.fn(), findMany: vi.fn() },
        stockMovement: { findMany: vi.fn() },
    },
}));

const baseOrder = {
    id: 'po-1',
    orderNumber: 'WO-260811-001',
    status: ProductionStatus.IN_PROGRESS,
    actualEndDate: null,
    actualQuantity: 10,
    estimatedConversionCost: 50,
    bom: {
        productVariant: {
            skuCode: 'SKU-1',
            product: { name: 'Produk A' },
        },
    },
};

describe('CostReportingService.getOrderCosting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when order does not exist', async () => {
        (prisma.productionOrder.findUnique as any).mockResolvedValue(null);
        const result = await CostReportingService.getOrderCosting('missing');
        expect(result).toBeNull();
    });

    it('sums material cost from movements linked via productionOrderId, even when reference does not contain PO-<orderNumber>', async () => {
        // Regression test: MaterialService writes StockMovement.reference as
        // `PROD-ISSUE-<orderNumber>`, never `PO-<orderNumber>`. The old query
        // matched only on `reference.contains('PO-...')` and always returned
        // an empty movement list, so materialCost was permanently 0.
        (prisma.productionOrder.findUnique as any).mockResolvedValue(
            baseOrder,
        );
        (prisma.stockMovement.findMany as any).mockResolvedValue([
            {
                id: 'sm-1',
                productionOrderId: 'po-1',
                reference: `PROD-ISSUE-${baseOrder.orderNumber}`,
                cost: 10,
                quantity: 5,
            },
            {
                id: 'sm-2',
                productionOrderId: 'po-1',
                reference: `PROD-ISSUE-${baseOrder.orderNumber}`,
                cost: 5,
                quantity: 10,
            },
        ]);

        const result = await CostReportingService.getOrderCosting('po-1');

        expect(result).not.toBeNull();
        // (10*5) + (5*10) = 100
        expect(result?.materialCost).toBe(100);
        expect(result?.totalCost).toBe(150); // 100 material + 50 conversion
        expect(result?.unitCost).toBe(15); // 150 / 10
    });

    it('still matches movements via the legacy reference pattern when productionOrderId is null', async () => {
        (prisma.productionOrder.findUnique as any).mockResolvedValue(
            baseOrder,
        );
        (prisma.stockMovement.findMany as any).mockResolvedValue([
            {
                id: 'sm-legacy',
                productionOrderId: null,
                reference: `PO-${baseOrder.orderNumber}`,
                cost: 20,
                quantity: 2,
            },
        ]);

        const result = await CostReportingService.getOrderCosting('po-1');

        expect(result?.materialCost).toBe(40);
    });

    it('ignores movements belonging to a different order', async () => {
        (prisma.productionOrder.findUnique as any).mockResolvedValue(
            baseOrder,
        );
        (prisma.stockMovement.findMany as any).mockResolvedValue([
            {
                id: 'sm-other',
                productionOrderId: 'po-OTHER',
                reference: 'PROD-ISSUE-WO-999',
                cost: 999,
                quantity: 1,
            },
        ]);

        const result = await CostReportingService.getOrderCosting('po-1');

        expect(result?.materialCost).toBe(0);
    });

    it('queries stockMovement with an OR filter covering both productionOrderId and the legacy reference pattern', async () => {
        (prisma.productionOrder.findUnique as any).mockResolvedValue(
            baseOrder,
        );
        (prisma.stockMovement.findMany as any).mockResolvedValue([]);

        await CostReportingService.getOrderCosting('po-1');

        expect(prisma.stockMovement.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    type: MovementType.OUT,
                    OR: expect.arrayContaining([
                        { productionOrderId: 'po-1' },
                        {
                            reference: {
                                contains: `PO-${baseOrder.orderNumber}`,
                            },
                        },
                    ]),
                }),
            }),
        );
    });
});
