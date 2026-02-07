import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionCostService } from '../src/services/production/cost-service';
import { prisma } from '@/lib/prisma';
import { MovementType } from '@prisma/client';

// Mock the prisma client
vi.mock('@/lib/prisma', () => ({
    prisma: {
        productionOrder: {
            findUnique: vi.fn(),
        },
        stockMovement: {
            findMany: vi.fn(),
        },
    },
}));

describe('ProductionCostService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should query stock movements using productionOrderId', async () => {
        const mockOrder = {
            id: 'order-123',
            orderNumber: 'PO-123',
            actualQuantity: 10,
            estimatedConversionCost: 100
        };

        // Setup mock return values
        // @ts-expect-error Mock implementation
        prisma.productionOrder.findUnique.mockResolvedValue(mockOrder);
        // @ts-expect-error Mock implementation
        prisma.stockMovement.findMany.mockResolvedValue([
            { quantity: 5, cost: 10 },
            { quantity: 5, cost: 20 }
        ]);

        const result = await ProductionCostService.calculateBatchCOGM('order-123');

        // Verify the query
        expect(prisma.stockMovement.findMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    { productionOrderId: 'order-123' },
                    { reference: { contains: 'PO-PO-123' } }
                ],
                type: MovementType.OUT
            }
        });

        // Calculation check:
        // Material: (5*10) + (5*20) = 50 + 100 = 150
        // Conversion: 100
        // Total: 250
        // Yield: 10
        // Unit Cost: 25
        expect(result).toBe(25);
    });
});
