import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductionExecutionService } from '@/services/production/execution-service';
import { ProductionCostService } from '@/services/production/cost-service';
import { prisma } from '@/lib/prisma';
import { ProductionStatus } from '@prisma/client';
import { AccountingService } from '@/services/accounting-service';

vi.mock('@/lib/prisma', () => ({
    prisma: {
        $transaction: vi.fn(),
    },
}));

vi.mock('@/services/production/cost-service', () => ({
    ProductionCostService: {
        calculateBatchCOGM: vi.fn(),
    },
}));

vi.mock('@/services/accounting-service', () => ({
    AccountingService: {
        recordInventoryMovement: vi.fn(),
    },
}));

describe('ProductionExecutionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should complete logRunningOutput even if COGM calculation throws an error', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Set up Prisma transaction mock to immediately execute the callback
        // @ts-expect-error Mock implementation
        prisma.$transaction.mockImplementation(async (callback) => {
            const mockTx = {
                productionExecution: {
                    findUniqueOrThrow: vi.fn().mockResolvedValue({
                        id: 'exec-1',
                        productionOrderId: 'po-1',
                    }),
                    update: vi.fn(),
                },
                productionOrder: {
                    findUniqueOrThrow: vi.fn().mockResolvedValue({
                        id: 'po-1',
                        status: ProductionStatus.IN_PROGRESS,
                        orderNumber: 'PO-001',
                        bomId: 'bom-1',
                        actualQuantity: 0
                    }),
                    update: vi.fn().mockResolvedValue({
                        id: 'po-1',
                        locationId: 'loc-1',
                        bom: {
                            productVariantId: 'variant-1',
                            items: []
                        },
                        plannedMaterials: []
                    })
                },
                inventory: {
                    upsert: vi.fn(),
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'inv-1',
                        productVariantId: 'variant-1',
                        quantity: 100
                    }),
                    update: vi.fn()
                },
                stockMovement: {
                    create: vi.fn().mockResolvedValue({ id: 'move-1' })
                },
                materialIssue: {
                    create: vi.fn()
                },
                location: {
                    findUnique: vi.fn()
                },
                productVariant: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'variant-1',
                        name: 'Test Variant'
                    }),
                    update: vi.fn()
                }
            };
            return callback(mockTx);
        });

        // @ts-expect-error Mock implementation
        ProductionCostService.calculateBatchCOGM.mockRejectedValue(new Error('COGM Calc failed'));
        // @ts-expect-error Mock implementation
        AccountingService.recordInventoryMovement.mockResolvedValue(true);

        // Execute logRunningOutput
        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-1',
            quantityProduced: 100,
            scrapQuantity: 0,
            notes: 'Test notes',
            userId: 'user-1'
        });

        // Verify that COGM calculation was called and threw an error, but the error was caught
        expect(ProductionCostService.calculateBatchCOGM).toHaveBeenCalled();
        expect(consoleWarnSpy).toHaveBeenCalledWith('COGM Calc failed', expect.any(Error));

        // Ensure that it didn't crash and the flow continued (transaction is executed)
        expect(prisma.$transaction).toHaveBeenCalled();

        consoleWarnSpy.mockRestore();
    });

    it('should complete addProductionOutput even if COGM calculation throws an error', async () => {
        const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // Set up Prisma transaction mock to immediately execute the callback
        // @ts-expect-error Mock implementation
        prisma.$transaction.mockImplementation(async (callback) => {
            const mockTx = {
                productionExecution: {
                    create: vi.fn().mockResolvedValue({
                        id: 'exec-2',
                        productionOrderId: 'po-2',
                    })
                },
                productionOrder: {
                    findUniqueOrThrow: vi.fn().mockResolvedValue({
                        id: 'po-2',
                        status: ProductionStatus.IN_PROGRESS,
                        orderNumber: 'PO-002',
                        bomId: 'bom-2',
                        actualQuantity: 0
                    }),
                    update: vi.fn().mockResolvedValue({
                        id: 'po-2',
                        locationId: 'loc-2',
                        bom: {
                            productVariantId: 'variant-2',
                            items: []
                        },
                        plannedMaterials: []
                    })
                },
                inventory: {
                    upsert: vi.fn(),
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'inv-2',
                        productVariantId: 'variant-2',
                        quantity: 100
                    }),
                    update: vi.fn()
                },
                stockMovement: {
                    create: vi.fn().mockResolvedValue({ id: 'move-2' })
                },
                materialIssue: {
                    create: vi.fn()
                },
                location: {
                    findUnique: vi.fn()
                },
                productVariant: {
                    findUnique: vi.fn().mockResolvedValue({
                        id: 'variant-2',
                        name: 'Test Variant 2'
                    }),
                    update: vi.fn()
                }
            };
            return callback(mockTx);
        });

        // @ts-expect-error Mock implementation
        ProductionCostService.calculateBatchCOGM.mockRejectedValue(new Error('COGM Calc failed in addProductionOutput'));
        // @ts-expect-error Mock implementation
        AccountingService.recordInventoryMovement.mockResolvedValue(true);

        // Execute addProductionOutput
        await ProductionExecutionService.addProductionOutput({
            productionOrderId: 'po-2',
            quantityProduced: 200,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            userId: 'user-2'
        });

        // Verify that COGM calculation was called and threw an error, but the error was caught
        expect(ProductionCostService.calculateBatchCOGM).toHaveBeenCalled();
        expect(consoleWarnSpy).toHaveBeenCalledWith('COGM Calc failed', expect.any(Error));

        // Ensure that it didn't crash and the flow continued (transaction is executed)
        expect(prisma.$transaction).toHaveBeenCalled();

        consoleWarnSpy.mockRestore();
    });
});
