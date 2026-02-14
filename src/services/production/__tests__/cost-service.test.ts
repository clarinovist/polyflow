/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionCostService } from '../cost-service';
import { prisma } from '@/lib/prisma';
import { MovementType } from '@prisma/client';

// Mock dependencies
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
    const orderId = 'po-123';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('calculateBatchCOGM', () => {
        it('should calculate correct COGM with material and conversion costs', async () => {
            // Mock Order
            vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
                id: orderId,
                orderNumber: 'PO-001',
                estimatedConversionCost: 500, // Conversion Cost
                actualQuantity: 10,            // Yield
            } as any);

            // Mock Material Movements (OUT)
            vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
                { cost: 100, quantity: 2, type: MovementType.OUT }, // 200
                { cost: 50, quantity: 4, type: MovementType.OUT },  // 200
            ] as any);

            // Total Material: 200 + 200 = 400
            // Conversion: 500
            // Total Cost: 900
            // Yield: 10
            // COGM: 90

            const result = await ProductionCostService.calculateBatchCOGM(orderId);
            expect(result).toBe(90);
        });

        it('should return 0 if order not found', async () => {
            vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue(null);
            const result = await ProductionCostService.calculateBatchCOGM(orderId);
            expect(result).toBe(0);
        });

        it('should handle zero yield gracefully (return 0)', async () => {
            vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
                id: orderId,
                actualQuantity: 0,
            } as any);

            vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([]);

            const result = await ProductionCostService.calculateBatchCOGM(orderId);
            expect(result).toBe(0); // avoids division by zero
        });
    });
});
