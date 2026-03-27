import { describe, it, expect, vi, beforeEach } from 'vitest';
import { confirmOrder } from '../orders-service';
import { prisma } from '@/lib/core/prisma';
import { ProductionService } from '@/services/production/production-service';
import { checkCreditLimit } from '../credit-service';
import { SalesOrderStatus, SalesOrderType } from '@prisma/client';
import { logger } from '@/lib/config/logger';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesOrder: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        inventory: {
            findUnique: vi.fn(),
            findMany: vi.fn(),
        },
        stockReservation: {
            aggregate: vi.fn(),
            groupBy: vi.fn(),
        },
        bom: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
        },
        productVariant: {
            findMany: vi.fn(),
        },
        $transaction: vi.fn((callback) => callback(prisma)),
    }
}));

vi.mock('@/services/production/production-service', () => ({
    ProductionService: {
        createOrderFromSales: vi.fn(),
    }
}));

vi.mock('@/services/inventory/inventory-service', () => ({
    InventoryService: {
        createStockReservation: vi.fn(),
    }
}));

vi.mock('../credit-service', () => ({
    checkCreditLimit: vi.fn(),
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

describe('confirmOrder', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Setup standard mock implementations for the successful path
        vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
            id: 'so-1',
            orderNumber: 'SO-001',
            status: SalesOrderStatus.DRAFT,
            orderType: SalesOrderType.MAKE_TO_ORDER,
            totalAmount: { toNumber: () => 100 } as never,
            customerId: 'cust-1',
            sourceLocationId: 'loc-1',
            items: [
                {
                    id: 'item-1',
                    productVariantId: 'pv-1',
                    quantity: { toNumber: () => 10 } as never,
                }
            ]
        } as never);

        vi.mocked(prisma.inventory.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.inventory.findMany).mockResolvedValue([]);
        vi.mocked(prisma.stockReservation.aggregate).mockResolvedValue({ _sum: { quantity: null } } as never);
        vi.mocked(prisma.stockReservation.groupBy).mockResolvedValue([] as never);
        vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: 'bom-1' } as never);
        vi.mocked(prisma.bom.findMany).mockResolvedValue([{ productVariantId: 'pv-1' }] as never);
        vi.mocked(prisma.productVariant.findMany).mockResolvedValue([] as never);
        vi.mocked(checkCreditLimit).mockResolvedValue(undefined);
    });

    it('should catch and log an error if ProductionService.createOrderFromSales throws synchronously', async () => {
        // Mock ProductionService to throw synchronously
        const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
        const mockError = new Error('Catastrophic failure in WO creation');

        vi.mocked(ProductionService.createOrderFromSales).mockImplementation(() => {
            throw mockError;
        });

        // Act
        await confirmOrder('so-1', 'user-1');

        // Assert
        expect(loggerErrorSpy).toHaveBeenCalledWith("Unexpected error in WO auto-creation", expect.objectContaining({ error: mockError }));

        // Cleanup
        loggerErrorSpy.mockRestore();
    });
});
