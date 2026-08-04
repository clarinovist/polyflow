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
        productionShift: {
            findFirst: vi.fn(),
        },
        productionOrder: {
            findUniqueOrThrow: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        stockMovement: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
        },
        inventory: {
            findUnique: vi.fn(),
        },
        materialIssue: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        scrapRecord: {
            updateMany: vi.fn(),
        },
        productVariant: {
            findUnique: vi.fn(),
        },
        employee: {
            findUnique: vi.fn(),
        },
        machine: {
            findUnique: vi.fn(),
        },
        processPieceRate: {
            findUnique: vi.fn(),
        },
    };

    const mockPrisma = {
        $transaction: vi.fn(
            async (callback: (tx: typeof mockTx) => Promise<unknown>) =>
                callback(mockTx),
        ),
    };

    return {
        prisma: mockPrisma,
        __mockTx: mockTx,
    };
});

vi.mock('../execution-material-location', () => ({
    resolveMaterialLocation: vi.fn(),
}));

vi.mock('@/services/inventory/core-service', () => ({
    InventoryCoreService: {
        deductStock: vi.fn(),
        incrementStock: vi.fn(),
        incrementStockWithCost: vi.fn(),
        validateAndLockStock: vi.fn(),
    },
}));

vi.mock('../cost-service', () => ({
    ProductionCostService: {
        calculateBatchCOGM: vi.fn().mockResolvedValue(0),
    },
}));

vi.mock('@/services/accounting/accounting-service', () => ({
    AccountingService: {
        recordInventoryMovement: vi.fn(),
        recordMaklonCosts: vi.fn(),
    },
}));

vi.mock('@/services/inventory/reservation-service', () => ({
    adjustReservationsForVoidOutput: vi.fn(),
    cancelSpecificReservation: vi.fn(),
    createStockReservation: vi.fn(),
    getSalesOrderResidualDemand: vi.fn().mockResolvedValue(0),
}));

vi.mock('../execution-output-posting', () => ({
    recordFinishedGoodsOutput: vi.fn(),
    triggerProductionOutputJournal: vi.fn(),
}));

const mockAssertRoutedOrderCanStart = vi.fn();
const mockAssertMachineCapableForOrder = vi.fn();
const mockEnsureRoutedOrderWipReservation = vi.fn();
const mockSyncProductionRunStatusFromOrders = vi.fn();

vi.mock('../routing-execution-guard', () => ({
    assertRoutedOrderCanStart: (...args: unknown[]) =>
        mockAssertRoutedOrderCanStart(...args),
    assertMachineCapableForOrder: (...args: unknown[]) =>
        mockAssertMachineCapableForOrder(...args),
    ensureRoutedOrderWipReservation: (...args: unknown[]) =>
        mockEnsureRoutedOrderWipReservation(...args),
    syncProductionRunStatusFromOrders: (...args: unknown[]) =>
        mockSyncProductionRunStatusFromOrders(...args),
}));

// @ts-expect-error - __mockTx is provided by vi.mock above
import { prisma, __mockTx as tx } from '@/lib/core/prisma';
import { ProductionExecutionService } from '../execution-service';
import {
    backflushMaterials,
    resolveBackflushQuantity,
} from '../execution-material-consumption';
import { resolveMaterialLocation } from '../execution-material-location';
import { InventoryCoreService } from '@/services/inventory/core-service';

function mockCommonConsumption() {
    vi.mocked(resolveMaterialLocation).mockResolvedValue('loc-1');
    vi.mocked(tx.inventory.findUnique).mockResolvedValue(null);
    vi.mocked(tx.stockMovement.findFirst).mockResolvedValue(null);
    vi.mocked(tx.stockMovement.create).mockResolvedValue({
        id: 'mov-1',
    } as never);
    vi.mocked(tx.materialIssue.findMany).mockResolvedValue([] as never);
    vi.mocked(tx.materialIssue.create).mockResolvedValue({
        id: 'mi-1',
    } as never);
    vi.mocked(tx.materialIssue.update).mockResolvedValue({
        id: 'stage-1',
    } as never);
    vi.mocked(
        InventoryCoreService.validateAndLockStock,
    ).mockResolvedValue(100 as never);
    vi.mocked(InventoryCoreService.deductStock).mockResolvedValue(undefined);
}

describe('backflushMaterials — STAGED→ISSUED conversion & manual-issue guards', () => {
    const mockOrder = {
        id: 'po-1',
        orderNumber: 'WO-001',
        plannedQuantity: 100,
        isMaklon: false,
        locationId: 'loc-1',
        materialSourceLocationId: null,
        routeStepId: null,
        bom: {
            productVariantId: 'pv-1',
            outputQuantity: 1,
            category: 'STANDARD',
            items: [],
        },
        plannedMaterials: [
            {
                productVariantId: 'pv-1',
                quantity: 10,
                productVariant: {
                    id: 'pv-1',
                    product: { productType: 'RAW_MATERIAL' },
                },
            },
        ],
    } as never;

    beforeEach(() => {
        vi.clearAllMocks();
        mockCommonConsumption();
    });

    it('backflushes materials when no manual issue exists', async () => {
        await backflushMaterials({
            tx,
            order: mockOrder,
            productionOrderId: 'po-1',
            totalConsumed: 100,
            reference: 'Backflush: WO-001',
            userId: 'user-1',
        });

        expect(InventoryCoreService.validateAndLockStock).toHaveBeenCalledWith(
            tx,
            'loc-1',
            'pv-1',
            10,
        );
        expect(InventoryCoreService.deductStock).toHaveBeenCalledWith(
            tx,
            'loc-1',
            'pv-1',
            10,
        );
        expect(tx.materialIssue.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'ISSUED', quantity: 10 }),
            }),
        );
        expect(tx.stockMovement.create).toHaveBeenCalled();
    });

    it('converts full STAGED material issues to ISSUED on backflush', async () => {
        vi.mocked(resolveMaterialLocation).mockResolvedValue('loc-wip');
        vi.mocked(tx.materialIssue.findMany).mockResolvedValue([
            { id: 'stage-1', quantity: 10 },
        ] as never);

        await backflushMaterials({
            tx,
            order: mockOrder,
            productionOrderId: 'po-1',
            totalConsumed: 100,
            reference: 'Backflush: WO-001',
            userId: 'user-1',
        });

        expect(tx.materialIssue.update).toHaveBeenCalledWith({
            where: { id: 'stage-1' },
            data: { status: 'ISSUED', locationId: 'loc-wip' },
        });
        expect(tx.materialIssue.create).not.toHaveBeenCalled();
    });

    it('converts STAGED fully and creates ISSUED for over-consumption', async () => {
        vi.mocked(resolveMaterialLocation).mockResolvedValue('loc-wip');
        // Staged 4, consume 10 → convert 4 + create ISSUED 6
        vi.mocked(tx.materialIssue.findMany).mockResolvedValue([
            { id: 'stage-1', quantity: 4 },
        ] as never);

        await backflushMaterials({
            tx,
            order: mockOrder,
            productionOrderId: 'po-1',
            totalConsumed: 100,
            reference: 'Backflush: WO-001',
            userId: 'user-1',
        });

        expect(tx.materialIssue.update).toHaveBeenCalledWith({
            where: { id: 'stage-1' },
            data: { status: 'ISSUED', locationId: 'loc-wip' },
        });
        expect(tx.materialIssue.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'ISSUED', quantity: 6 }),
            }),
        );
    });

    it('shrinks STAGED and creates ISSUED when consume is partial', async () => {
        vi.mocked(resolveMaterialLocation).mockResolvedValue('loc-wip');
        // Staged 15, consume 10 → STAGED becomes 5, create ISSUED 10
        vi.mocked(tx.materialIssue.findMany).mockResolvedValue([
            { id: 'stage-1', quantity: 15 },
        ] as never);

        await backflushMaterials({
            tx,
            order: mockOrder,
            productionOrderId: 'po-1',
            totalConsumed: 100,
            reference: 'Backflush: WO-001',
            userId: 'user-1',
        });

        expect(tx.materialIssue.update).toHaveBeenCalledWith({
            where: { id: 'stage-1' },
            data: { quantity: 5 },
        });
        expect(tx.materialIssue.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ status: 'ISSUED', quantity: 10 }),
            }),
        );
    });

    it('skips backflush when manual issue movement (PROD-ISSUE-) exists', async () => {
        vi.mocked(tx.stockMovement.findFirst).mockResolvedValueOnce({
            id: 'sm-manual-1',
            reference: 'PROD-ISSUE-WO-001',
        } as never);

        await backflushMaterials({
            tx,
            order: mockOrder,
            productionOrderId: 'po-1',
            totalConsumed: 100,
            reference: 'Backflush: WO-001',
            userId: 'user-1',
        });

        expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
        expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
        expect(tx.materialIssue.create).not.toHaveBeenCalled();
        expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });

    it('skips backflush when consolidated issue movement (PROD-CONSOL-) exists', async () => {
        vi.mocked(tx.stockMovement.findFirst)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
                id: 'sm-consol-1',
                reference: 'PROD-CONSOL-ISSUE-WO-001',
            } as never);

        await backflushMaterials({
            tx,
            order: mockOrder,
            productionOrderId: 'po-1',
            totalConsumed: 100,
            reference: 'Backflush: WO-001',
            userId: 'user-1',
        });

        expect(InventoryCoreService.validateAndLockStock).not.toHaveBeenCalled();
        expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
        expect(tx.materialIssue.create).not.toHaveBeenCalled();
        expect(tx.stockMovement.create).not.toHaveBeenCalled();
    });
});

describe('backflush BOM ratio per SKU (baling → WIP PCS)', () => {
    const shellExecution = {
        id: 'exec-shell',
        productionOrderId: 'po-1',
        machineId: null,
        operatorId: 'op-bal',
        shiftId: 'shift-1',
        enteredQuantity: null,
        enteredUnit: null,
        notes: null,
    };

    function makeOrder(
        items: Array<{ productVariantId: string; quantity: number }>,
    ) {
        return {
            id: 'po-1',
            orderNumber: 'WO-001',
            actualQuantity: 100,
            plannedQuantity: 200,
            isMaklon: false,
            locationId: 'loc-1',
            materialSourceLocationId: null,
            routeStepId: null,
            salesOrderId: null,
            productionRunId: null,
            bom: {
                productVariantId: 'pv-fg',
                outputQuantity: 1,
                category: 'STANDARD',
                items: items.map((it) => ({
                    productVariantId: it.productVariantId,
                    quantity: it.quantity,
                    productVariant: { product: { id: 'prod-1' } },
                })),
            },
            plannedMaterials: [],
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        mockCommonConsumption();
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue(
            shellExecution as never,
        );
        vi.mocked(tx.productionShift.findFirst).mockResolvedValue({
            id: 'shift-1',
        } as never);
        vi.mocked(tx.productionExecution.create).mockResolvedValue({
            id: 'exec-new',
        } as never);
        vi.mocked(tx.productionOrder.findUnique).mockResolvedValue({
            productionRunId: null,
        } as never);
    });

    it('SKU A: 5 BAL × 10 PCS/BAL → deductStock 50 PCS WIP', async () => {
        vi.mocked(tx.productionOrder.update).mockResolvedValue(
            makeOrder([{ productVariantId: 'pv-wip-a', quantity: 10 }]) as never,
        );

        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-shell',
            quantityProduced: 5,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: 'shift-1',
            operatorId: 'op-bal',
            userId: 'user-1',
        });

        expect(InventoryCoreService.deductStock).toHaveBeenCalledWith(
            expect.anything(),
            'loc-1',
            'pv-wip-a',
            50,
        );
        expect(tx.productionOrder.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'po-1' },
                data: { actualQuantity: { increment: 5 } },
            }),
        );
    });

    it('SKU B: 5 BAL × 6 PCS/BAL → deductStock 30 PCS WIP', async () => {
        vi.mocked(tx.productionOrder.update).mockResolvedValue(
            makeOrder([{ productVariantId: 'pv-wip-b', quantity: 6 }]) as never,
        );

        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-shell',
            quantityProduced: 5,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: 'shift-1',
            operatorId: 'op-bal',
            userId: 'user-1',
        });

        expect(InventoryCoreService.deductStock).toHaveBeenCalledWith(
            expect.anything(),
            'loc-1',
            'pv-wip-b',
            30,
        );
    });

    it('outputs FG +5 BAL on both ratio cases', async () => {
        const { recordFinishedGoodsOutput } = await import(
            '../execution-output-posting'
        );
        vi.mocked(tx.productionOrder.update).mockResolvedValue(
            makeOrder([{ productVariantId: 'pv-wip-a', quantity: 10 }]) as never,
        );

        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-shell',
            quantityProduced: 5,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: 'shift-1',
            operatorId: 'op-bal',
            userId: 'user-1',
        });

        expect(recordFinishedGoodsOutput).toHaveBeenCalledTimes(1);
        expect(recordFinishedGoodsOutput).toHaveBeenCalledWith(
            expect.objectContaining({
                productionOrderId: 'po-1',
                quantityProduced: 5,
            }),
        );
    });

    it('BOM item quantity 0 → no consumption and no ratio-1 fallback', async () => {
        vi.mocked(tx.productionOrder.update).mockResolvedValue(
            makeOrder([{ productVariantId: 'pv-wip-a', quantity: 0 }]) as never,
        );

        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-shell',
            quantityProduced: 5,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: 'shift-1',
            operatorId: 'op-bal',
            userId: 'user-1',
        });

        expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
    });

    it('invalid ratio never falls back to 1 (resolveBackflushQuantity)', () => {
        const order = makeOrder([{ productVariantId: 'pv-wip-a', quantity: 0 }]);
        const zeroItem = resolveBackflushQuantity({
            item: { productVariantId: 'pv-wip-a', quantity: 0 } as never,
            order: order as never,
            totalConsumed: 5,
            isUsingPlanned: false,
        });
        expect(zeroItem).toBe(0);

        const zeroOutput = resolveBackflushQuantity({
            item: { productVariantId: 'pv-wip-a', quantity: 10 } as never,
            order: {
                ...order,
                bom: { ...order.bom, outputQuantity: 0 },
            } as never,
            totalConsumed: 5,
            isUsingPlanned: false,
        });
        expect(zeroOutput).not.toBe(5);
        expect(Number.isFinite(zeroOutput)).toBe(false);
    });

    it('insufficient WIP → whole submit rejects, no FG output posted', async () => {
        const { recordFinishedGoodsOutput } = await import(
            '../execution-output-posting'
        );
        vi.mocked(tx.productionOrder.update).mockResolvedValue(
            makeOrder([{ productVariantId: 'pv-wip-a', quantity: 10 }]) as never,
        );
        vi.mocked(
            InventoryCoreService.validateAndLockStock,
        ).mockRejectedValueOnce(new Error('Insufficient stock'));

        await expect(
            ProductionExecutionService.logRunningOutput({
                executionId: 'exec-shell',
                quantityProduced: 5,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                shiftId: 'shift-1',
                operatorId: 'op-bal',
                userId: 'user-1',
            }),
        ).rejects.toThrow('Insufficient stock');

        expect(recordFinishedGoodsOutput).not.toHaveBeenCalled();
        expect(InventoryCoreService.deductStock).not.toHaveBeenCalled();
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
});
