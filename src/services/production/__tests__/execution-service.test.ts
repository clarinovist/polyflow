import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => {
    const mockTx = {
        productionExecution: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
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
    };

    const mockPrisma = {
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
    }
}));

vi.mock('./material-service', () => ({
    ProductionMaterialService: {}
}));

import { prisma, __mockTx as tx } from '@/lib/core/prisma';
import { ProductionExecutionService } from '../execution-service';

describe('ProductionExecutionService.voidExecution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(tx.productionExecution.findFirst).mockResolvedValue(null);
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
        vi.mocked(tx.productionExecution.findFirst)
            .mockResolvedValueOnce(null as never)
            .mockResolvedValueOnce({ createdAt: nextCreatedAt } as never);
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