import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => {
    const mockTx = {
        productionExecution: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findUniqueOrThrow: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
        },
        productionOrder: {
            findUniqueOrThrow: vi.fn(),
            update: vi.fn(),
        },
        stockMovement: {
            findMany: vi.fn(),
            create: vi.fn(),
        },
        materialIssue: {
            updateMany: vi.fn(),
        },
        machineDowntime: {
            create: vi.fn(),
        },
    };

    const mockPrisma = {
        productionExecution: {
            findMany: vi.fn(),
        },
        machineDowntime: {
            create: vi.fn(),
        },
        $transaction: vi.fn(async (callback: (tx: typeof mockTx) => Promise<unknown>) => callback(mockTx)),
    };

    return {
        prisma: mockPrisma,
        __mockTx: mockTx,
    };
});

vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: {
        deductStock: vi.fn(),
        incrementStock: vi.fn(),
        incrementStockWithCost: vi.fn(),
        validateAndLockStock: vi.fn(),
    }
}));

vi.mock('../cost-service', () => ({
    ProductionCostService: {
        calculateBatchCOGM: vi.fn(),
    }
}));

vi.mock('../finance/auto-journal-service', () => ({
    AutoJournalService: {}
}));

vi.mock('../accounting/accounting-service', () => ({
    AccountingService: {
        recordInventoryMovement: vi.fn(),
        recordMaklonCosts: vi.fn(),
    }
}));

vi.mock('../material-service', () => ({
    ProductionMaterialService: {}
}));

vi.mock('../execution-output-posting', () => ({
    recordFinishedGoodsOutput: vi.fn(),
    triggerProductionOutputJournal: vi.fn(),
}));

vi.mock('../execution-helpers', () => ({
    backflushMaterials: vi.fn(),
    recordExecutionScrap: vi.fn(),
    recordFinishedGoodsOutput: vi.fn(),
    triggerProductionOutputJournal: vi.fn(),
}));

vi.mock('../execution-unit-conversion', () => ({
    resolveProductionOutputUnit: vi.fn().mockResolvedValue({
        baseQuantityProduced: 50,
        conversionFactorSnapshot: 1,
    }),
}));

// @ts-expect-error - __mockTx is provided by vi.mock above
import { prisma, __mockTx as tx } from '@/lib/core/prisma';
import { ProductionExecutionService } from '../execution-service';

describe('ProductionExecutionService.voidExecution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(tx.productionExecution.findFirst).mockResolvedValue(null);
        vi.mocked(tx.productionExecution.findMany).mockResolvedValue([] as never);
    });

    it('rejects executions that were already voided', async () => {
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            quantityProduced: 10,
            createdAt: new Date('2026-04-15T10:00:00.000Z'),
            status: 'VOIDED',
            productionOrder: { id: 'po-1' },
        } as never);

        await expect(ProductionExecutionService.voidExecution('exec-1')).rejects.toThrow('Execution has already been voided');

        expect(tx.stockMovement.findMany).not.toHaveBeenCalled();
        expect(tx.productionExecution.update).not.toHaveBeenCalled();
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
    });

    it('voids a completed execution once and updates related records', async () => {
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            quantityProduced: 10,
            createdAt: new Date('2026-04-15T10:00:00.000Z'),
            status: 'COMPLETED',
            productionOrder: { id: 'po-1' },
        } as never);
        vi.mocked(tx.stockMovement.findMany).mockResolvedValue([] as never);
        vi.mocked(tx.materialIssue.updateMany).mockResolvedValue({ count: 0 } as never);
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({
            id: 'po-1',
            actualQuantity: 10,
            plannedQuantity: 20,
            status: 'COMPLETED',
        } as never);
        vi.mocked(tx.productionExecution.count).mockResolvedValue(0 as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({ id: 'po-1' } as never);
        vi.mocked(tx.productionExecution.update).mockResolvedValue({ id: 'exec-1', status: 'VOIDED' } as never);

        await ProductionExecutionService.voidExecution('exec-1');

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(tx.stockMovement.findMany).toHaveBeenCalledTimes(1);
        expect(tx.productionOrder.update).toHaveBeenCalledWith({
            where: { id: 'po-1' },
            data: {
                actualQuantity: 0,
                status: 'DRAFT',
            }
        });
        expect(tx.productionExecution.update).toHaveBeenCalledWith({
            where: { id: 'exec-1' },
            data: { status: 'VOIDED' }
        });
    });

    it('uses midpoint boundaries so nearby executions are not reversed together', async () => {
        const executionCreatedAt = new Date('2026-04-15T08:02:57.177Z');
        const nextCreatedAt = new Date('2026-04-15T08:03:20.823Z');

        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            quantityProduced: 10,
            createdAt: executionCreatedAt,
            status: 'COMPLETED',
            productionOrder: { id: 'po-1' },
        } as never);
        vi.mocked(tx.productionExecution.findMany)
            .mockResolvedValueOnce([{ createdAt: nextCreatedAt }] as never);
        vi.mocked(tx.stockMovement.findMany).mockResolvedValue([] as never);
        vi.mocked(tx.materialIssue.updateMany).mockResolvedValue({ count: 0 } as never);
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({
            id: 'po-1',
            actualQuantity: 10,
            plannedQuantity: 20,
            status: 'COMPLETED',
        } as never);
        vi.mocked(tx.productionExecution.count).mockResolvedValue(0 as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({ id: 'po-1' } as never);
        vi.mocked(tx.productionExecution.update).mockResolvedValue({ id: 'exec-1', status: 'VOIDED' } as never);

        await ProductionExecutionService.voidExecution('exec-1');

        const midpoint = new Date((executionCreatedAt.getTime() + nextCreatedAt.getTime()) / 2);

        expect(tx.stockMovement.findMany).toHaveBeenCalledWith({
            where: {
                productionOrderId: 'po-1',
                createdAt: {
                    gte: new Date(executionCreatedAt.getTime() - 30000),
                    lt: midpoint,
                }
            }
        });
        expect(tx.materialIssue.updateMany).toHaveBeenCalledWith({
            where: {
                productionOrderId: 'po-1',
                issuedAt: {
                    gte: new Date(executionCreatedAt.getTime() - 30000),
                    lt: midpoint,
                }
            },
            data: { status: 'VOIDED' }
        });
    });
});

describe('ProductionExecutionService.getActiveExecutions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return active executions', async () => {
        // Arrange
        const mockExecutions = [
            {
                id: 'exec-1',
                productionOrderId: 'po-1',
                startTime: new Date(),
                endTime: null,
                productionOrder: {
                    id: 'po-1',
                    orderNumber: 'WO-001',
                    status: 'IN_PROGRESS',
                    bom: { name: 'BOM 1' },
                },
                machine: { name: 'Machine 1' },
                operator: { name: 'Operator 1' },
            },
        ];

        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue(mockExecutions as never);

        // Act
        const result = await ProductionExecutionService.getActiveExecutions();

        // Assert
        expect(result).toEqual(mockExecutions);
        expect(prisma.productionExecution.findMany).toHaveBeenCalled();
    });

    it('should return empty array when no active executions', async () => {
        // Arrange
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([]);

        // Act
        const result = await ProductionExecutionService.getActiveExecutions();

        // Assert
        expect(result).toEqual([]);
    });
});

describe('ProductionExecutionService.recordDowntime', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should record machine downtime', async () => {
        // Arrange
        vi.mocked(prisma.machineDowntime.create).mockResolvedValue({} as any);

        // Act
        await ProductionExecutionService.recordDowntime({
            machineId: 'machine-1',
            startTime: new Date(),
            endTime: new Date(),
            reason: 'Maintenance',
            createdById: 'user-1',
        });

        // Assert
        expect(prisma.machineDowntime.create).toHaveBeenCalled();
    });
});

describe('ProductionExecutionService.logRunningOutput', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create new execution and order quantities via logRunningOutput', async () => {
        // Arrange
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            machineId: 'machine-1',
            operatorId: 'op-1',
            shiftId: 'shift-1',
            enteredQuantity: null,
            enteredUnit: null,
            notes: null,
        } as never);
        vi.mocked(tx.productionExecution.create).mockResolvedValue({ id: 'exec-new' } as never);
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({
            id: 'po-1',
            actualQuantity: 100,
            orderNumber: 'WO-001',
            isMaklon: false,
            locationId: 'loc-1',
            bom: { productVariantId: 'pv-1', items: [] },
            plannedMaterials: [],
        } as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({ id: 'po-1' } as never);

        // Act
        await ProductionExecutionService.logRunningOutput({
                    executionId: 'exec-1',
                    quantityProduced: 50,
                    scrapQuantity: 5,
                    scrapProngkolQty: 0,
                    scrapDaunQty: 0,
                    notes: 'Partial log',
                    userId: 'user-1',
                });

        // Assert — now creates new execution instead of updating
        expect(tx.productionExecution.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    productionOrderId: 'po-1',
                    quantityProduced: expect.anything(),
                    status: 'COMPLETED',
                })
            })
        );
        expect(tx.productionOrder.update).toHaveBeenCalled();
    });
});

describe('ProductionExecutionService.addProductionOutput', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should add production output and create execution', async () => {
        // Arrange
        vi.mocked(tx.productionExecution.create).mockResolvedValue({
            id: 'exec-1',
        } as never);
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({
            id: 'po-1',
            actualQuantity: 100,
            orderNumber: 'WO-001',
            isMaklon: false,
            locationId: 'loc-1',
            bom: { productVariantId: 'pv-1', items: [] },
            plannedMaterials: [],
        } as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({ id: 'po-1' } as never);

        // Act
        await ProductionExecutionService.addProductionOutput({
            productionOrderId: 'po-1',
            quantityProduced: 50,
            scrapQuantity: 5,
            startTime: new Date(),
            endTime: new Date(),
            userId: 'user-1',
        } as any);

        // Assert
        expect(tx.productionExecution.create).toHaveBeenCalled();
        expect(tx.productionOrder.update).toHaveBeenCalled();
    });

    it('should throw error when output quantity is 0 for non-rework orders', async () => {
        // Arrange
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({
            id: 'po-1',
            bom: { category: 'EXTRUSION' },
        } as never);

        // Act & Assert
        await expect(
            ProductionExecutionService.addProductionOutput({
                productionOrderId: 'po-1',
                quantityProduced: 0,
                scrapQuantity: 0,
                startTime: new Date(),
                userId: 'user-1',
            } as any)
        ).rejects.toThrow('Output quantity must be greater than 0');
    });
});