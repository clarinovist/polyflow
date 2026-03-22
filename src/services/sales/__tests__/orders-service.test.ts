import { describe, it, expect, vi, beforeEach } from 'vitest';
import { confirmOrder } from '../orders-service';
import { prisma } from '@/lib/prisma';
import { ProductionService } from '@/services/production-service';
import { InventoryService } from '@/services/inventory-service';
import { checkCreditLimit } from '../credit-service';
import { SalesOrderStatus, SalesOrderType } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        salesOrder: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        inventory: {
            findUnique: vi.fn(),
        },
        stockReservation: {
            aggregate: vi.fn(),
        },
        bom: {
            findFirst: vi.fn(),
        },
        $transaction: vi.fn((callback) => callback(prisma)),
    }
}));

vi.mock('@/services/production-service', () => ({
    ProductionService: {
        createOrderFromSales: vi.fn(),
    }
}));

vi.mock('@/services/inventory-service', () => ({
    InventoryService: {
        createStockReservation: vi.fn(),
    }
}));

vi.mock('../credit-service', () => ({
    checkCreditLimit: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({
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
            totalAmount: { toNumber: () => 100 } as any,
            customerId: 'cust-1',
            sourceLocationId: 'loc-1',
            items: [
                {
                    id: 'item-1',
                    productVariantId: 'pv-1',
                    quantity: { toNumber: () => 10 } as any,
                }
            ]
        } as any);

        vi.mocked(prisma.inventory.findUnique).mockResolvedValue(null);
        vi.mocked(prisma.stockReservation.aggregate).mockResolvedValue({ _sum: { quantity: null } } as any);
        vi.mocked(prisma.bom.findFirst).mockResolvedValue({ id: 'bom-1' } as any);
        vi.mocked(checkCreditLimit).mockResolvedValue(undefined);
    });

    it('should catch and log an error if ProductionService.createOrderFromSales throws synchronously', async () => {
        // Mock ProductionService to throw synchronously
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const mockError = new Error('Catastrophic failure in WO creation');

        vi.mocked(ProductionService.createOrderFromSales).mockImplementation(() => {
            throw mockError;
        });

        // Act
        await confirmOrder('so-1', 'user-1');

        // Assert
        expect(consoleErrorSpy).toHaveBeenCalledWith("Unexpected error in WO auto-creation:", mockError);

        // Cleanup
        consoleErrorSpy.mockRestore();
    });
});
