import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionCostService } from '../production/cost-service';
import { prisma } from '@/lib/prisma';
import { MovementType } from '@prisma/client';

describe('ProductionCostService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('calculateBatchCOGM', () => {
        it('should return 0 if order does not exist', async () => {
            ((prisma as any).productionOrder.findUnique as any).mockResolvedValue(null);
            const result = await ProductionCostService.calculateBatchCOGM('invalid-id');
            expect(result).toBe(0);
        });

        it('should return 0 if actual quantity is zero or less', async () => {
            ((prisma as any).productionOrder.findUnique as any).mockResolvedValue({
                id: 'po-1',
                orderNumber: 'WO-001',
                actualQuantity: 0,
                estimatedConversionCost: 100
            });
            ((prisma as any).stockMovement.findMany as any).mockResolvedValue([]);
            const result = await ProductionCostService.calculateBatchCOGM('po-1');
            expect(result).toBe(0);
        });

        it('should correctly calculate COGM based on material movements and conversion costs', async () => {
            ((prisma as any).productionOrder.findUnique as any).mockResolvedValue({
                id: 'po-1',
                orderNumber: 'WO-001',
                actualQuantity: 10,
                estimatedConversionCost: 50 // Total conversion cost
            });

            // Material cost: = (5 * 10) + (10 * 5) = 50 + 50 = 100
            ((prisma as any).stockMovement.findMany as any).mockResolvedValue([
                { cost: 10, quantity: 5, type: MovementType.OUT },
                { cost: 5, quantity: 10, type: MovementType.OUT }
            ]);

            const result = await ProductionCostService.calculateBatchCOGM('po-1');
            
            // Total cost = Material (100) + Conversion (50) = 150
            // Net yield (actual quantity) = 10
            // Expected COGM = 150 / 10 = 15
            expect(result).toBe(15);
        });

        it('should gracefully handle missing conversion cost or missing component costs', async () => {
            ((prisma as any).productionOrder.findUnique as any).mockResolvedValue({
                id: 'po-1',
                orderNumber: 'WO-001',
                actualQuantity: 20,
                estimatedConversionCost: null // Missing conversion cost
            });

            // Material cost: = (0 * 10) + (10 * 2) = 0 + 20 = 20
            ((prisma as any).stockMovement.findMany as any).mockResolvedValue([
                { cost: null, quantity: 10, type: MovementType.OUT },
                { cost: 10, quantity: 2, type: MovementType.OUT }
            ]);

            const result = await ProductionCostService.calculateBatchCOGM('po-1');
            
            // Expected COGM = 20 / 20 = 1
            expect(result).toBe(1);
        });
    });
});
