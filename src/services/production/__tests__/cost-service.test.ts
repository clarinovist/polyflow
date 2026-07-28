import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionCostService } from '../cost-service';
import { prisma } from '@/lib/core/prisma';
import { MovementType } from '@prisma/client';

// Mock dependencies
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: {
            findUnique: vi.fn(),
        },
        stockMovement: {
            findMany: vi.fn(),
        },
        maklonCostItem: {
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

            const result = await ProductionCostService.calculateBatchCOGM(orderId);
            expect(result).toBe(90);
        });

        it('should deduct IN material movements and support maklon conversion costs', async () => {
            vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue({
                id: orderId,
                orderNumber: 'PO-MAKLON',
                isMaklon: true,
                actualQuantity: 10,
                bom: { productVariantId: 'fg-1' },
            } as any);

            vi.mocked(prisma.stockMovement.findMany).mockResolvedValue([
                { productVariantId: 'raw-1', cost: 100, quantity: 5, type: MovementType.OUT }, // +500
                { productVariantId: 'raw-1', cost: 100, quantity: 1, type: MovementType.IN },  // -100
                { productVariantId: 'fg-1', cost: 900, quantity: 10, type: MovementType.IN },   // excluded FG IN
            ] as any);

            vi.mocked((prisma as any).maklonCostItem.findMany).mockResolvedValue([
                { amount: 200 },
                { amount: 100 },
            ]);

            // Material: 500 - 100 = 400
            // Conversion (Maklon): 200 + 100 = 300
            // Total Cost: 700 / 10 = 70
            const result = await ProductionCostService.calculateBatchCOGM(orderId);
            expect(result).toBe(70);
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
