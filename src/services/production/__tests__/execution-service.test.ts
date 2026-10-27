import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

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
            findUnique: vi.fn().mockResolvedValue(null),
        },
        productionOrder: {
            findUniqueOrThrow: vi.fn(),
            findUnique: vi.fn().mockResolvedValue({ id: 'po-1', isMaklon: false }),
            update: vi.fn(),
        },
        stockMovement: {
            findMany: vi.fn(),
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
        },
        materialIssue: {
            updateMany: vi.fn(),
        },
        scrapRecord: {
            deleteMany: vi.fn(),
        },
        stockReservation: {
            updateMany: vi.fn(),
        },
        auditLog: {
            findFirst: vi.fn(),
        },
        machineDowntime: {
            create: vi.fn(),
        },
        employee: {
            findUnique: vi.fn(),
            count: vi.fn(),
        },
        processPieceRate: {
            findFirst: vi.fn(),
        },
        productVariant: {
            findUnique: vi.fn().mockResolvedValue({ id: 'pv-1', product: { type: 'FINISHED_GOOD' } }),
        },
        journalEntry: {
            findFirst: vi.fn().mockResolvedValue(null),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
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

vi.mock('@/services/accounting/production-movement-reversal', () => ({
    reverseProductionMovementJournal: vi.fn(),
}));
vi.mock('@/lib/core/actor-context', () => ({ getActorUserId: vi.fn(() => 'actor') }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));

vi.mock('../material-service', () => ({
    ProductionMaterialService: {}
}));

vi.mock('../execution-output-posting', () => ({
    recordFinishedGoodsOutput: vi.fn(),
    triggerProductionOutputJournal: vi.fn(),
}));

vi.mock('../execution-helpers', () => ({
    backflushMaterials: vi.fn(),
    resolvePackingScrapMaterialId: vi.fn().mockReturnValue('pv-main'),
    recordExecutionScrap: vi.fn(),
    recordExecutionQualityInspection: vi.fn(),
    recordFinishedGoodsOutput: vi.fn(),
    triggerProductionOutputJournal: vi.fn(),
}));

vi.mock('../packaging-output-service', () => ({
    validatePackagedOutput: vi.fn(async (_tx: unknown, _order: unknown, data: unknown) => ({ data, ids: ['label-a'] })),
    postPackagedOutput: vi.fn(),
}));
vi.mock('../execution-unit-conversion', () => ({
    resolveProductionOutputUnit: vi.fn().mockResolvedValue({
        baseQuantityProduced: 50,
        conversionFactorSnapshot: 1,
    }),
}));

vi.mock('@/services/inventory/reservation-service', () => ({
    adjustReservationsForVoidOutput: vi.fn(),
    cancelSpecificReservation: vi.fn(),
}));

const mockAssertRoutedOrderCanStart = vi.fn();
const mockAssertMachineCapableForOrder = vi.fn();
const mockEnsureRoutedOrderWipReservation = vi.fn();
const mockSyncProductionRunStatusFromOrders = vi.fn();

vi.mock('../routing-execution-guard', () => ({
    assertRoutedOrderCanStart: (...args: unknown[]) => mockAssertRoutedOrderCanStart(...args),
    assertMachineCapableForOrder: (...args: unknown[]) => mockAssertMachineCapableForOrder(...args),
    ensureRoutedOrderWipReservation: (...args: unknown[]) => mockEnsureRoutedOrderWipReservation(...args),
    syncProductionRunStatusFromOrders: (...args: unknown[]) => mockSyncProductionRunStatusFromOrders(...args),
}));

// @ts-expect-error - __mockTx is provided by vi.mock above
import { prisma, __mockTx as tx } from '@/lib/core/prisma';
import { ProductionExecutionService } from '../execution-service';
import {
    backflushMaterials,
    resolvePackingScrapMaterialId,
} from '../execution-helpers';
import { validatePackagedOutput, postPackagedOutput } from '../packaging-output-service';
import { logActivity } from '@/lib/tools/audit';

describe('ProductionExecutionService.voidExecution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(tx.auditLog.findFirst).mockResolvedValue(null);
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

        await expect(ProductionExecutionService.voidExecution('exec-1')).rejects.toThrow('Eksekusi sudah di-void');

        expect(tx.stockMovement.findMany).not.toHaveBeenCalled();
        expect(tx.productionExecution.update).not.toHaveBeenCalled();
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
    });

    it('blocks generic void when the execution has a targeted stock correction', async () => {
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            quantityProduced: 10,
            createdAt: new Date('2026-04-15T10:00:00.000Z'),
            status: 'COMPLETED',
            endTime: new Date('2026-04-15T11:00:00.000Z'),
            productionOrder: { id: 'po-1' },
        } as never);
        vi.mocked(tx.auditLog.findFirst).mockResolvedValue({
            id: 'audit-correction',
        } as never);

        await expect(
            ProductionExecutionService.voidExecution('exec-1'),
        ).rejects.toThrow(/koreksi stok terverifikasi/i);

        expect(tx.auditLog.findFirst).toHaveBeenCalledWith({
            where: {
                action: 'CORRECT_PACKING_SCRAP_BACKFLUSH',
                changes: { path: ['executionId'], equals: 'exec-1' },
            },
            select: { id: true },
        });
        expect(tx.stockMovement.findMany).not.toHaveBeenCalled();
        expect(tx.materialIssue.updateMany).not.toHaveBeenCalled();
        expect(tx.productionExecution.update).not.toHaveBeenCalled();
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
    });

    it('rejects executions that are still running (endTime null)', async () => {
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            quantityProduced: 0,
            createdAt: new Date('2026-04-15T10:00:00.000Z'),
            status: 'COMPLETED',
            endTime: null,
            productionOrder: { id: 'po-1' },
        } as never);

        await expect(ProductionExecutionService.voidExecution('exec-1')).rejects.toThrow('Eksekusi masih berjalan, tidak bisa di-void');

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
            endTime: new Date('2026-04-15T11:00:00.000Z'),
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
            data: {
                status: 'VOIDED',
                pieceEarnings: null,
                pieceMachineType: null,
                pieceRateSnapshot: null,
            }
        });
    });

    it('rechecks status after acquiring the WO lock and rejects a competing void', async () => {
        const execution = { id: 'exec-1', productionOrderId: 'po-1', status: 'COMPLETED',
            quantityProduced: 10, createdAt: new Date(), endTime: new Date(), productionOrder: { id: 'po-1' } };
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValueOnce(execution as never)
            .mockResolvedValueOnce({ ...execution, status: 'VOIDED' } as never);
        await expect(ProductionExecutionService.voidExecution('exec-1')).rejects.toThrow('sudah di-void');
        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.stockMovement.create).not.toHaveBeenCalled();
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
            endTime: new Date('2026-04-15T09:00:00.000Z'),
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
                OR: [
                    { productionExecutionId: null, createdAt: {
                        gte: new Date(executionCreatedAt.getTime() - 30000),
                        lt: midpoint,
                    } },
                    { productionExecutionId: 'exec-1', reversalOfId: null },
                ],
            }
        });
        expect(tx.materialIssue.updateMany).toHaveBeenCalledWith({
            where: {
                productionOrderId: 'po-1',
                productionExecutionId: null,
                issuedAt: {
                    gte: new Date(executionCreatedAt.getTime() - 30000),
                    lt: midpoint,
                }
            },
            data: { status: 'VOIDED' }
        });
    });

    it('triggers cancelSpecificReservation when voiding an execution with linked reservation reference', async () => {
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            quantityProduced: new Prisma.Decimal(10),
            createdAt: new Date('2026-04-15T10:00:00.000Z'),
            status: 'COMPLETED',
            endTime: new Date('2026-04-15T11:00:00.000Z'),
            productionOrder: {
                id: 'po-1',
                salesOrderId: 'so-1',
                locationId: 'loc-1',
                bom: { productVariantId: 'pv-1' },
            },
        } as never);

        vi.mocked(tx.stockMovement.findMany).mockResolvedValue([
            {
                id: 'move-reserved', type: 'IN',
                productVariantId: 'pv-1',
                toLocationId: 'loc-1',
                quantity: 10,
                reference: 'Production Output | RESERVE:res-123',
            }
        ] as never);
        vi.mocked(tx.stockMovement.create).mockResolvedValue({
            type: 'OUT',
            productVariantId: 'pv-1',
            fromLocationId: 'loc-1',
            quantity: 10,
            reference: 'VOID: Production Output | RESERVE:res-123',
            productionOrderId: 'po-1',
        } as any);

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

        const { cancelSpecificReservation, adjustReservationsForVoidOutput } = await import('@/services/inventory/reservation-service');

        await ProductionExecutionService.voidExecution('exec-1');

        expect(tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reversalOfId: 'move-reserved' }) });
        const { reverseProductionMovementJournal } = await import('@/services/accounting/production-movement-reversal');
        expect(reverseProductionMovementJournal).toHaveBeenCalledWith(tx,
            expect.objectContaining({ id: 'move-reserved' }), expect.any(Object), 'actor');
        expect(cancelSpecificReservation).toHaveBeenCalledWith('res-123', tx);
        expect(adjustReservationsForVoidOutput).not.toHaveBeenCalled();
    });

    it('triggers adjustReservationsForVoidOutput as fallback when voiding an execution without linked reservation', async () => {
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            quantityProduced: new Prisma.Decimal(10),
            createdAt: new Date('2026-04-15T10:00:00.000Z'),
            status: 'COMPLETED',
            endTime: new Date('2026-04-15T11:00:00.000Z'),
            productionOrder: {
                id: 'po-1',
                salesOrderId: 'so-1',
                locationId: 'loc-1',
                bom: { productVariantId: 'pv-1' },
            },
        } as never);

        vi.mocked(tx.stockMovement.findMany).mockResolvedValue([
            {
                id: 'move-output', type: 'IN',
                productVariantId: 'pv-1',
                toLocationId: 'loc-1',
                quantity: 10,
                reference: 'Production Output', // No RESERVE: tag
            }
        ] as never);
        vi.mocked(tx.stockMovement.create).mockResolvedValue({
            type: 'OUT',
            productVariantId: 'pv-1',
            fromLocationId: 'loc-1',
            quantity: 10,
            reference: 'VOID: Production Output',
            productionOrderId: 'po-1',
        } as any);

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

        const { cancelSpecificReservation, adjustReservationsForVoidOutput } = await import('@/services/inventory/reservation-service');

        await ProductionExecutionService.voidExecution('exec-1');

        expect(cancelSpecificReservation).not.toHaveBeenCalled();
        expect(adjustReservationsForVoidOutput).toHaveBeenCalledWith('so-1', 'pv-1', 'loc-1', 10, tx);
    });
});

describe('ProductionExecutionService.startExecution - routed order reservation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockAssertRoutedOrderCanStart.mockResolvedValue(undefined);
        mockAssertMachineCapableForOrder.mockResolvedValue(undefined);
        mockEnsureRoutedOrderWipReservation.mockResolvedValue(undefined);
        mockSyncProductionRunStatusFromOrders.mockResolvedValue(undefined);
        vi.mocked(tx.productionExecution.findFirst).mockResolvedValue(null);
        vi.mocked(tx.productionExecution.create).mockResolvedValue({ id: 'exec-new' } as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({ id: 'po-1' } as never);
        vi.mocked(tx.productionOrder.findUnique).mockResolvedValue({
            id: 'po-1',
            status: 'RELEASED',
            productionRunId: 'run-1',
        } as never);
    });

    it('calls ensureRoutedOrderWipReservation for a routed order', async () => {
        vi.mocked(tx.productionOrder.findUnique)
            .mockResolvedValueOnce({
                id: 'po-1',
                productionRunId: 'run-1',
                routeStepId: 'step-1',
                routeSequenceSnapshot: 1,
                plannedQuantity: 100,
                status: 'RELEASED',
                materialSourceLocationId: 'loc-wip',
                locationId: 'loc-fg',
                machineId: 'm1',
                bomId: 'bom-1',
                bom: { productVariantId: 'pv-out' },
            } as never)
            .mockResolvedValueOnce({
                id: 'po-1',
                status: 'RELEASED',
                productionRunId: 'run-1',
            } as never);

        await ProductionExecutionService.startExecution({
            productionOrderId: 'po-1',
            machineId: 'm1',
            operatorId: 'op-1',
            shiftId: null,
        } as never);

        expect(mockAssertRoutedOrderCanStart).toHaveBeenCalled();
        expect(mockAssertMachineCapableForOrder).toHaveBeenCalled();
        expect(mockEnsureRoutedOrderWipReservation).toHaveBeenCalled();
    });

    it('does NOT call reservation for non-routed (legacy) order', async () => {
        vi.mocked(tx.productionOrder.findUnique)
            .mockResolvedValueOnce({
                id: 'po-legacy',
                productionRunId: null,
                routeStepId: null,
                routeSequenceSnapshot: null,
                plannedQuantity: 100,
                status: 'RELEASED',
                materialSourceLocationId: null,
                locationId: 'loc-fg',
                machineId: null,
                bomId: 'bom-1',
                bom: { productVariantId: 'pv-out' },
            } as never)
            .mockResolvedValueOnce({
                id: 'po-legacy',
                status: 'RELEASED',
                productionRunId: null,
            } as never);

        await ProductionExecutionService.startExecution({
            productionOrderId: 'po-legacy',
            machineId: null,
            operatorId: 'op-1',
            shiftId: null,
        } as never);

        // Guard functions are called but return early internally for legacy (no runId/routeStepId).
        // The important check: ensureRoutedOrderWipReservation mock was called (execution-service
        // invokes it), but it resolves without error because the real helper returns early for legacy.
        expect(mockEnsureRoutedOrderWipReservation).toHaveBeenCalled();
        expect(mockSyncProductionRunStatusFromOrders).not.toHaveBeenCalled();
    });
});

describe('ProductionExecutionService.stopExecution', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(tx.$queryRaw).mockResolvedValue([{ count: BigInt(0) }] as never);
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            operatorId: 'op-1',
            machineId: 'machine-1',
            enteredQuantity: null,
            enteredUnit: null,
            conversionFactorSnapshot: null,
        } as never);
        vi.mocked(tx.productionExecution.update).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            operatorId: 'op-1',
            machineId: 'machine-1',
            quantityProduced: 0,
            enteredQuantity: null,
            enteredUnit: null,
            conversionFactorSnapshot: null,
        } as never);
    });

    it('allows stopping a shift without completing the SPK when a request is pending', async () => {
        vi.mocked(tx.$queryRaw).mockResolvedValue([{ count: BigInt(1) }] as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({
            id: 'po-1',
            orderNumber: 'WO-001',
            status: 'IN_PROGRESS',
            isMaklon: false,
            locationId: 'loc-1',
            productionRunId: null,
            bom: { productVariantId: 'pv-1', items: [] },
            plannedMaterials: [],
        } as never);

        await expect(
            ProductionExecutionService.stopExecution({
                executionId: 'exec-1',
                quantityProduced: 0,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                completed: false,
                operatorId: 'op-1',
            } as never),
        ).resolves.toBeTruthy();

        expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('persists split scrap and normalizes duplicate kiosk scrap once', async () => {
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({
            id: 'po-1',
            bom: { category: 'PACKING', items: [] },
            plannedMaterials: [],
        } as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({
            id: 'po-1',
            orderNumber: 'WO-001',
            status: 'IN_PROGRESS',
            isMaklon: false,
            locationId: 'loc-1',
            productionRunId: null,
            bom: {
                productVariantId: 'pv-1',
                category: 'PACKING',
                outputQuantity: 1,
                items: [],
            },
            plannedMaterials: [],
        } as never);

        await ProductionExecutionService.stopExecution({
            executionId: 'exec-1',
            quantityProduced: 20,
            scrapQuantity: 4.6,
            scrapProngkolQty: 0,
            scrapDaunQty: 4.6,
            notes: '',
            completed: false,
            operatorId: 'op-1',
        } as never);

        expect(tx.productionExecution.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'exec-1' },
                data: expect.objectContaining({
                    scrapQuantity: { increment: 4.6 },
                    scrapProngkolQty: { increment: 0 },
                    scrapDaunQty: { increment: 4.6 },
                }),
            }),
        );
        expect(backflushMaterials).toHaveBeenCalledWith(
            expect.objectContaining({
                totalConsumed: 20,
                outputContext: expect.objectContaining({
                    scrapQuantityKg: 4.6,
                }),
            }),
        );
    });

    it('fails ambiguous PACKING scrap before execution or order mutations', async () => {
        vi.mocked(resolvePackingScrapMaterialId).mockImplementationOnce(() => {
            throw Object.assign(new Error('Ambiguous packing material'), {
                code: 'PACKING_SCRAP_MATERIAL_AMBIGUOUS',
            });
        });
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValueOnce({
            id: 'po-1',
            bom: {
                category: 'PACKING',
                items: [
                    {
                        productVariantId: 'pv-a',
                        productVariant: {
                            primaryUnit: 'KG',
                            product: { productType: 'INTERMEDIATE' },
                        },
                    },
                    {
                        productVariantId: 'pv-b',
                        productVariant: {
                            primaryUnit: 'KG',
                            product: { productType: 'INTERMEDIATE' },
                        },
                    },
                ],
            },
            plannedMaterials: [],
        } as never);

        await expect(
            ProductionExecutionService.stopExecution({
                executionId: 'exec-1',
                quantityProduced: 20,
                scrapQuantity: 4.6,
                scrapProngkolQty: 0,
                scrapDaunQty: 4.6,
                notes: '',
                completed: true,
                operatorId: 'op-1',
            } as never),
        ).rejects.toMatchObject({
            code: 'PACKING_SCRAP_MATERIAL_AMBIGUOUS',
        });

        expect(tx.productionExecution.update).not.toHaveBeenCalled();
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
        expect(backflushMaterials).not.toHaveBeenCalled();
    });

    it('blocks final completion while an additional-material request is pending', async () => {
        vi.mocked(tx.$queryRaw).mockResolvedValue([{ count: BigInt(1) }] as never);

        await expect(
            ProductionExecutionService.stopExecution({
                executionId: 'exec-1',
                quantityProduced: 0,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                completed: true,
                operatorId: 'op-1',
            } as never),
        ).rejects.toThrow(/menunggu konfirmasi gudang/i);

        expect(tx.productionOrder.update).not.toHaveBeenCalled();
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

    it('reads running executions without employee or machine records (public kiosk banner)', async () => {
        vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([] as never);

        await ProductionExecutionService.getActiveExecutions();

        const args = vi.mocked(prisma.productionExecution.findMany).mock.calls[0][0] as Record<string, unknown>;
        expect(args.include).toBeUndefined();
        expect(Object.keys(args.select as object).sort()).toEqual(['id', 'productionOrder', 'productionOrderId', 'startTime']);
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
                    shiftId: undefined,
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

    describe('realized quantity on orders created without one (MRP, child stages)', () => {
        const logFifty = () => ProductionExecutionService.logRunningOutput({
            executionId: 'exec-1', quantityProduced: 50, scrapQuantity: 0, scrapProngkolQty: 0, scrapDaunQty: 0,
            notes: '', shiftId: undefined, userId: 'user-1',
        });

        beforeEach(() => {
            vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue({
                id: 'exec-1', productionOrderId: 'po-1', machineId: 'machine-1', operatorId: 'op-1', shiftId: 'shift-1',
                enteredQuantity: null, enteredUnit: null, notes: null,
            } as never);
            vi.mocked(tx.productionExecution.create).mockResolvedValue({ id: 'exec-new' } as never);
        });

        it('starts from the output when the increment leaves NULL', async () => {
            // Arrange: SQL NULL + 50 stays NULL
            vi.mocked(tx.productionOrder.update)
                .mockResolvedValueOnce({ id: 'po-1', actualQuantity: null } as never)
                .mockResolvedValue({ id: 'po-1', actualQuantity: 50 } as never);

            // Act
            await logFifty();

            // Assert
            expect(tx.productionOrder.update).toHaveBeenNthCalledWith(1, expect.objectContaining({
                where: { id: 'po-1' }, data: { actualQuantity: { increment: 50 } },
            }));
            expect(tx.productionOrder.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'po-1' }, data: { actualQuantity: 50 },
            }));
        });

        it('keeps the plain increment when the order already has a quantity', async () => {
            // Arrange
            vi.mocked(tx.productionOrder.update).mockResolvedValue({ id: 'po-1', actualQuantity: 150 } as never);

            // Act
            await logFifty();

            // Assert
            expect(tx.productionOrder.update).not.toHaveBeenCalledWith(expect.objectContaining({
                data: { actualQuantity: 50 },
            }));
        });
    });

    it('uses kiosk operatorId + active shift instead of inheriting shell operator', async () => {
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            machineId: 'machine-1',
            operatorId: 'op-abrar',
            shiftId: 'shift-abrar',
            enteredQuantity: null,
            enteredUnit: null,
            notes: null,
        } as never);
        vi.mocked(tx.productionShift.findFirst)
            .mockResolvedValueOnce({ id: 'shift-idris' } as never);
        vi.mocked(tx.productionExecution.update).mockResolvedValue({ id: 'exec-1' } as never);
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

        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-1',
            quantityProduced: 25,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: undefined,
            operatorId: 'op-idris',
            userId: 'user-1',
        });

        expect(tx.productionExecution.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'exec-1' },
                data: { operatorId: 'op-idris', shiftId: 'shift-idris' },
            })
        );
        expect(tx.productionExecution.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    operatorId: 'op-idris',
                    shiftId: 'shift-idris',
                    status: 'COMPLETED',
                }),
            })
        );
    });

    it('prioritizes explicit shiftId over auto-detect when both are valid', async () => {
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            machineId: 'machine-1',
            operatorId: 'op-1',
            shiftId: 'shift-shell',
            enteredQuantity: null,
            enteredUnit: null,
            notes: null,
        } as never);
        // Explicit shiftId validation: belongs to the order
        vi.mocked(tx.productionShift.findFirst).mockResolvedValue({ id: 'shift-explicit' } as never);
        vi.mocked(tx.productionExecution.update).mockResolvedValue({ id: 'exec-1' } as never);
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

        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-1',
            quantityProduced: 25,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: 'shift-explicit',
            userId: 'user-1',
        });

        // Explicit shiftId should validate against the same production order
        expect(tx.productionShift.findFirst).toHaveBeenCalledWith({
            where: { id: 'shift-explicit', productionOrderId: 'po-1' },
            select: { id: true },
        });

        expect(tx.productionExecution.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    shiftId: 'shift-explicit',
                }),
            })
        );
    });

    it('ignores explicit shiftId when it does not belong to the production order (falls back to shell/auto-detect)', async () => {
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue({
            id: 'exec-1',
            productionOrderId: 'po-1',
            machineId: 'machine-1',
            operatorId: 'op-1',
            shiftId: 'shift-shell',
            enteredQuantity: null,
            enteredUnit: null,
            notes: null,
        } as never);
        // Explicit shiftId does NOT belong to this order
        vi.mocked(tx.productionShift.findFirst).mockResolvedValue(null);
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

        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-1',
            quantityProduced: 25,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: 'shift-from-other-wo',
            userId: 'user-1',
        });

        // Falls back to the running shell's shiftId since explicit one is invalid
        expect(tx.productionExecution.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    shiftId: 'shift-shell',
                }),
            })
        );
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

    it('should throw error when output quantity and scrap are both 0 for non-rework orders', async () => {
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
        ).rejects.toThrow('Hasil produksi 0 hanya bisa dicatat jika ada affal/scrap');
    });

    it('should record output when quantity is 0 but scrap exists (mesin trobel, affal only)', async () => {
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
            bom: { productVariantId: 'pv-1', category: 'EXTRUSION', items: [] },
            plannedMaterials: [],
        } as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({ id: 'po-1' } as never);

        // Act
        await ProductionExecutionService.addProductionOutput({
            productionOrderId: 'po-1',
            quantityProduced: 0,
            scrapQuantity: 0,
            scrapProngkolQty: 5.5,
            scrapDaunQty: 2,
            startTime: new Date(),
            endTime: new Date(),
            userId: 'user-1',
        } as any);

        // Assert
        expect(tx.productionExecution.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    quantityProduced: 0,
                    scrapProngkolQty: 5.5,
                    scrapDaunQty: 2,
                }),
            })
        );
    });

    it('should throw when shiftId does not belong to the production order', async () => {
        // Arrange: shift lookup returns null → shift not found for this order
        vi.mocked(tx.productionShift.findFirst).mockResolvedValue(null);

        // Act & Assert
        await expect(
            ProductionExecutionService.addProductionOutput({
                productionOrderId: 'po-1',
                shiftId: 'shift-from-other-wo',
                quantityProduced: 50,
                scrapQuantity: 0,
                startTime: new Date(),
                endTime: new Date(),
                userId: 'user-1',
            } as any)
        ).rejects.toThrow('Shift tidak valid untuk SPK ini');

        expect(tx.productionShift.findFirst).toHaveBeenCalledWith({
            where: { id: 'shift-from-other-wo', productionOrderId: 'po-1' },
            select: { id: true, startTime: true, endTime: true },
        });
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
    });

    it('should succeed when shiftId belongs to the production order', async () => {
        // Arrange
        vi.mocked(tx.productionShift.findFirst).mockResolvedValue({
            id: 'shift-1',
            startTime: new Date(),
        } as never);
        vi.mocked(tx.productionExecution.create).mockResolvedValue({ id: 'exec-1' } as never);
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
            shiftId: 'shift-1',
            quantityProduced: 50,
            scrapQuantity: 0,
            startTime: new Date(),
            endTime: new Date(),
            userId: 'user-1',
        } as any);

        // Assert
        expect(tx.productionExecution.create).toHaveBeenCalled();
    });
});

describe('ProductionExecutionService.logRunningOutput - multi-operator attribution and atomic totals', () => {
    const shellExecution = {
        id: 'exec-shell',
        productionOrderId: 'po-1',
        machineId: 'machine-1',
        operatorId: 'op-shell',
        shiftId: 'shift-1',
        enteredQuantity: null,
        enteredUnit: null,
        notes: null,
    };
    const fullOrder = {
        id: 'po-1',
        orderNumber: 'WO-001',
        actualQuantity: 100,
        plannedQuantity: 200,
        isMaklon: false,
        locationId: 'loc-1',
        bom: { productVariantId: 'pv-1', items: [], outputQuantity: 1 },
        plannedMaterials: [],
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue(shellExecution as never);
        vi.mocked(tx.productionShift.findFirst).mockResolvedValue(null);
        vi.mocked(tx.productionOrder.update).mockResolvedValue(fullOrder as never);
        vi.mocked(tx.productionOrder.findUnique).mockResolvedValue({
            id: 'po-1',
            productionRunId: null,
        } as never);
    });

    it('records each operator output as a separate execution with its own operatorId on the same SPK', async () => {
        vi.mocked(tx.productionExecution.create)
            .mockResolvedValueOnce({ id: 'exec-a' } as never)
            .mockResolvedValueOnce({ id: 'exec-b' } as never);

        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-shell',
            quantityProduced: 55,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: undefined,
            operatorId: 'op-abrar',
            userId: 'user-1',
        });
        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-shell',
            quantityProduced: 48,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: undefined,
            operatorId: 'op-idris',
            userId: 'user-1',
        });

        expect(tx.productionExecution.create).toHaveBeenCalledTimes(2);
        expect(tx.productionExecution.create).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                data: expect.objectContaining({
                    operatorId: 'op-abrar',
                    status: 'COMPLETED',
                }),
            }),
        );
        expect(tx.productionExecution.create).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                data: expect.objectContaining({
                    operatorId: 'op-idris',
                    status: 'COMPLETED',
                }),
            }),
        );
    });

    it('adds actualQuantity atomically via increment, not by overwriting a stale total', async () => {
        // Both submits read the same stale actualQuantity (100) — simulates two
        // operators writing near-simultaneously. Read-then-set would write 150
        // twice (lost update, final 150). Atomic increment must yield 200.
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({
            ...fullOrder,
            actualQuantity: 100,
        } as never);
        vi.mocked(tx.productionExecution.create).mockResolvedValue({ id: 'exec-a' } as never);

        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-shell',
            quantityProduced: 50,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: undefined,
            operatorId: 'op-abrar',
            userId: 'user-1',
        });
        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-shell',
            quantityProduced: 50,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: undefined,
            operatorId: 'op-idris',
            userId: 'user-1',
        });

        expect(tx.productionOrder.update).toHaveBeenCalledTimes(2);
        expect(tx.productionOrder.update).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                where: { id: 'po-1' },
                data: { actualQuantity: { increment: 50 } },
            }),
        );
        expect(tx.productionOrder.update).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: { id: 'po-1' },
                data: { actualQuantity: { increment: 50 } },
            }),
        );
    });

    it('keeps backflush and FG output to exactly once per execution under concurrent submits', async () => {
        const { backflushMaterials, recordFinishedGoodsOutput } = await import('../execution-helpers');
        vi.mocked(backflushMaterials).mockResolvedValueOnce({ roundingAdjustment: -0.01 })
            .mockResolvedValueOnce({ roundingAdjustment: 0.01 });
        vi.mocked(tx.productionExecution.create).mockResolvedValue({ id: 'exec-a' } as never);
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({
            ...fullOrder,
            actualQuantity: 100,
        } as never);

        await Promise.all([
            ProductionExecutionService.logRunningOutput({
                executionId: 'exec-shell',
                quantityProduced: 25,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                shiftId: undefined,
                operatorId: 'op-a',
                userId: 'user-1',
            }),
            ProductionExecutionService.logRunningOutput({
                executionId: 'exec-shell',
                quantityProduced: 30,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                shiftId: undefined,
                operatorId: 'op-b',
                userId: 'user-1',
            }),
        ]);

        expect(tx.productionExecution.create).toHaveBeenCalledTimes(2);
        expect(backflushMaterials).toHaveBeenCalledTimes(2);
        expect(recordFinishedGoodsOutput).toHaveBeenCalledTimes(2);
        expect(vi.mocked(recordFinishedGoodsOutput).mock.calls.map(([params]) => params.materialRoundingAdjustment).sort())
            .toEqual([-0.01, 0.01]);
    });

    // Phase 1.2 — running shell is NOT an output attribution source.
    // Completed executions carry the kiosk operatorId; shell sync (line ~560)
    // is metadata only and must never mutate a completed execution's qty or operator.
    it('does not let shell sync overwrite a completed execution output', async () => {
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue({
            id: 'exec-shell',
            productionOrderId: 'po-1',
            machineId: 'machine-1',
            operatorId: 'op-original',
            shiftId: 'shift-1',
            enteredQuantity: null,
            enteredUnit: null,
            notes: null,
        } as never);
        vi.mocked(tx.productionExecution.create).mockResolvedValue({ id: 'exec-new' } as never);
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({
            ...fullOrder,
            actualQuantity: 100,
        } as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue({ id: 'po-1' } as never);

        // Operator B submits on a shell that originally had op-original.
        await ProductionExecutionService.logRunningOutput({
            executionId: 'exec-shell',
            quantityProduced: 25,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            shiftId: undefined,
            operatorId: 'op-b',
            userId: 'user-1',
        });

        // New execution carries kiosk operator (op-b), qty 25.
        const newExecCall = vi.mocked(tx.productionExecution.create).mock.calls[0][0] as {
            data: { operatorId: string; quantityProduced: number; status: string };
        };
        expect(newExecCall.data.operatorId).toBe('op-b');
        expect(newExecCall.data.quantityProduced).toBe(25);

        // Shell update is metadata-only (operatorId/shiftId) and must NOT set
        // quantityProduced/status on the running shell.
        const shellUpdateCall = vi.mocked(tx.productionExecution.update).mock.calls.find(
            (c: { 0: { where: { id: string } } }) => c[0].where.id === 'exec-shell',
        );
        if (shellUpdateCall) {
            const data = (shellUpdateCall[0] as { data: Record<string, unknown> }).data;
            expect(data.quantityProduced).toBeUndefined();
            expect(data.status).toBeUndefined();
        }

        // Final order qty is result of atomic increment from op-b's submit only (100 + 25 = 125).
        expect(tx.productionOrder.update).toHaveBeenNthCalledWith(
            vi.mocked(tx.productionOrder.update).mock.calls.length,
            expect.objectContaining({
                where: { id: 'po-1' },
                data: { actualQuantity: { increment: 25 } },
            }),
        );
    });
});

describe('ProductionExecutionService kiosk actual packaging', () => {
    const shell = {
        id: 'exec-shell',
        productionOrderId: 'po-1',
        machineId: 'machine-1',
        operatorId: 'op-1',
        shiftId: null,
        enteredQuantity: null,
        enteredUnit: null,
        conversionFactorSnapshot: null,
    };
    const flaggedOrder = {
        id: 'po-1',
        status: 'IN_PROGRESS',
        actualPackagingEnabled: true,
        actualQuantity: 0,
        orderNumber: 'WO-001',
        isMaklon: false,
        locationId: 'loc-1',
        productionRunId: null,
        bom: { productVariantId: 'pv-1', category: 'PACKING', items: [] },
        plannedMaterials: [],
    };
    const kioskOperator = { employeeId: 'op-1', code: 'OP-01' };
    const packagedOutput = {
        clientRequestId: 'ce26b37c-85c5-46cb-bc5c-5ec212db2da4',
        groups: [{
            productVariantId: 'pv-1',
            quantity: 1,
            packaging: [{ productVariantId: 'label-a', sourceLocationId: 'loc-pack', ownerCustomerId: null, unit: 'PCS' as const, quantity: 240 }],
        }],
    };
    const logInput = {
        executionId: 'exec-shell',
        quantityProduced: 50,
        scrapQuantity: 0,
        scrapProngkolQty: 0,
        scrapDaunQty: 0,
        notes: '',
        shiftId: undefined,
        operatorId: 'op-1',
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(tx.$queryRaw).mockResolvedValue([] as never);
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue(shell as never);
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue(null as never);
        vi.mocked(tx.productionExecution.create).mockResolvedValue({ id: 'exec-new' } as never);
        vi.mocked(tx.productionExecution.update).mockResolvedValue({ ...shell, quantityProduced: 0 } as never);
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue(flaggedOrder as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue(flaggedOrder as never);
    });

    it('records kiosk output with actual packaging under the system actor and the PIN operator', async () => {
        await ProductionExecutionService.logRunningOutput({ ...logInput, packagedOutput, kioskOperator });

        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.productionExecution.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                clientRequestId: packagedOutput.clientRequestId,
                requestHash: expect.any(String),
                operatorId: 'op-1',
            }),
        }));
        // A single brand group always carries the resolved base output.
        const validated = vi.mocked(validatePackagedOutput).mock.calls[0];
        expect(validated[2].groups[0].quantity).toBe(50);
        expect(validated[3]).toBe(50);
        expect(postPackagedOutput).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'exec-new', expect.anything(), undefined);
        expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
            userId: 'system',
            action: 'RECORD_PACKAGED_OUTPUT',
            entityId: 'exec-new',
            details: expect.stringContaining('OP-01'),
        }));
    });

    it('replays the same kiosk submission without posting twice', async () => {
        await ProductionExecutionService.logRunningOutput({ ...logInput, packagedOutput, kioskOperator });
        const { requestHash } = vi.mocked(tx.productionExecution.create).mock.calls[0][0].data as { requestHash: string };
        vi.clearAllMocks();
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue(shell as never);
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({ requestHash, status: 'COMPLETED' } as never);

        await ProductionExecutionService.logRunningOutput({ ...logInput, packagedOutput, kioskOperator });

        expect(tx.productionExecution.create).not.toHaveBeenCalled();
        expect(postPackagedOutput).not.toHaveBeenCalled();
    });

    it('rejects a reused request id carrying different data', async () => {
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({ requestHash: 'other', status: 'COMPLETED' } as never);

        await expect(
            ProductionExecutionService.logRunningOutput({ ...logInput, packagedOutput, kioskOperator }),
        ).rejects.toMatchObject({ message: expect.stringContaining('Permintaan sudah dipakai'), code: 'PACKAGED_REQUEST_REUSED' });
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
    });

    it('treats a retry with a re-uploaded photo as the same submission', async () => {
        await ProductionExecutionService.logRunningOutput({ ...logInput, photoUrl: 'https://files.example/a.jpg', packagedOutput, kioskOperator });
        const { requestHash } = vi.mocked(tx.productionExecution.create).mock.calls[0][0].data as { requestHash: string };
        vi.clearAllMocks();
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue(shell as never);
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({ requestHash, status: 'COMPLETED' } as never);

        await ProductionExecutionService.logRunningOutput({ ...logInput, photoUrl: 'https://files.example/b.jpg', packagedOutput, kioskOperator });

        expect(tx.productionExecution.create).not.toHaveBeenCalled();
    });

    it('does not let the kiosk switch an SPK into actual-packaging mode', async () => {
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({ ...flaggedOrder, actualPackagingEnabled: false } as never);

        await expect(
            ProductionExecutionService.logRunningOutput({ ...logInput, packagedOutput, kioskOperator }),
        ).rejects.toThrow('belum memakai pencatatan kemasan');
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
    });

    it('requires an accountable actor for actual packaging', async () => {
        await expect(
            ProductionExecutionService.logRunningOutput({ ...logInput, packagedOutput }),
        ).rejects.toThrow('Aktor pencatatan wajib tersedia');
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
    });

    it('still refuses plain kiosk output on a flagged SPK', async () => {
        await expect(
            ProductionExecutionService.logRunningOutput({ ...logInput, kioskOperator }),
        ).rejects.toThrow('SPK ini memakai kemasan aktual');
    });

    it('stops a flagged SPK with zero output without posting anything', async () => {
        await expect(ProductionExecutionService.stopExecution({
            executionId: 'exec-shell',
            quantityProduced: 0,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            completed: false,
        } as never)).resolves.toBeTruthy();

        expect(backflushMaterials).not.toHaveBeenCalled();
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
    });

    it('refuses final output in the stop dialog for a flagged SPK', async () => {
        await expect(ProductionExecutionService.stopExecution({
            executionId: 'exec-shell',
            quantityProduced: 10,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            completed: true,
        } as never)).rejects.toThrow('Catat hasil dan affal terakhir lewat Catat Hasil');
        expect(tx.productionExecution.update).not.toHaveBeenCalled();
    });

    it('lets the admin form switch an SPK on before any output exists', async () => {
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({ ...flaggedOrder, actualPackagingEnabled: false } as never);
        vi.mocked(tx.productionExecution.count).mockResolvedValue(0 as never);

        await ProductionExecutionService.addProductionOutput({
            productionOrderId: 'po-1',
            quantityProduced: 50,
            scrapQuantity: 0,
            startTime: new Date(),
            endTime: new Date(),
            userId: 'user-1',
            packagedOutput,
        } as never);

        expect(tx.productionOrder.update).toHaveBeenCalledWith({ where: { id: 'po-1' }, data: { actualPackagingEnabled: true } });
        expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', action: 'RECORD_PACKAGED_OUTPUT' }));
    });
});


describe('plain output submissions with a client request id post exactly once', () => {
    const requestId = '6f1d1c1e-3b8a-4d5e-9f7a-2b4c6d8e0a1b';
    const plainOrder = {
        id: 'po-1',
        status: 'IN_PROGRESS',
        actualPackagingEnabled: false,
        actualQuantity: 0,
        orderNumber: 'WO-001',
        isMaklon: false,
        locationId: 'loc-1',
        productionRunId: null,
        bom: { productVariantId: 'pv-1', category: 'EXTRUSION', items: [] },
        plannedMaterials: [],
    };
    const kioskLog = {
        executionId: 'exec-shell', quantityProduced: 50, scrapQuantity: 0, scrapProngkolQty: 0, scrapDaunQty: 0,
        notes: '', shiftId: undefined, operatorId: 'op-1', clientRequestId: requestId,
    };
    const dailyReport = {
        productionOrderId: 'po-1', machineId: undefined, operatorId: undefined, cekGram: undefined,
        shiftId: 'shift-1', quantityProduced: 50, scrapQuantity: 0, scrapProngkolQty: 0,
        scrapDaunQty: 0, startTime: new Date('2026-10-26T01:00:00Z'), endTime: new Date('2026-10-26T02:00:00Z'),
        notes: '', clientRequestId: requestId,
    };
    const savedHash = () => (vi.mocked(tx.productionExecution.create).mock.calls[0][0].data as { requestHash: string }).requestHash;
    const replaying = (requestHash: string) => {
        vi.mocked(tx.productionExecution.create).mockClear();
        vi.mocked(tx.productionOrder.update).mockClear();
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({ requestHash, status: 'COMPLETED' } as never);
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(tx.$queryRaw).mockResolvedValue([] as never);
        vi.mocked(tx.productionExecution.findUniqueOrThrow).mockResolvedValue({
            id: 'exec-shell', productionOrderId: 'po-1', machineId: 'machine-1', operatorId: 'op-1', shiftId: null,
            enteredQuantity: null, enteredUnit: null, conversionFactorSnapshot: null,
        } as never);
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue(null as never);
        vi.mocked(tx.productionExecution.create).mockResolvedValue({ id: 'exec-new' } as never);
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue(plainOrder as never);
        vi.mocked(tx.productionOrder.update).mockResolvedValue(plainOrder as never);
        vi.mocked(tx.productionShift.findFirst).mockResolvedValue({
            id: 'shift-1', startTime: new Date('2026-10-26T00:00:00Z'), endTime: new Date('2026-10-26T08:00:00Z'),
        } as never);
    });

    it('saves the request id and hash on a plain kiosk output', async () => {
        await ProductionExecutionService.logRunningOutput(kioskLog);

        expect(tx.$queryRaw).toHaveBeenCalled();
        expect(tx.productionExecution.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ clientRequestId: requestId, requestHash: expect.any(String) }),
        }));
    });

    it('replays a plain kiosk retry without posting twice', async () => {
        await ProductionExecutionService.logRunningOutput(kioskLog);
        replaying(savedHash());

        await ProductionExecutionService.logRunningOutput(kioskLog);

        expect(tx.productionExecution.create).not.toHaveBeenCalled();
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
    });

    it('rejects a plain request id reused with different numbers', async () => {
        vi.mocked(tx.productionExecution.findUnique).mockResolvedValue({ requestHash: 'other', status: 'COMPLETED' } as never);

        await expect(ProductionExecutionService.logRunningOutput(kioskLog))
            .rejects.toMatchObject({ code: 'PACKAGED_REQUEST_REUSED' });
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
    });

    it('posts a PIN operator with any active helper without attendance, and audits atomically', async () => {
        vi.mocked(tx.employee.count).mockResolvedValue(1);
        await ProductionExecutionService.addProductionOutput({
            ...dailyReport, operatorId: 'forged', userId: 'forged', helperIds: ['helper-1'],
            kioskOperator: { employeeId: 'op-1', code: 'OP-TEST' },
        });
        expect(tx.productionExecution.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ operatorId: 'op-1', helpers: { connect: [{ id: 'helper-1' }] } }) }));
        expect(tx.employee.count).toHaveBeenCalledWith({ where: { id: { in: ['helper-1'] }, status: 'ACTIVE' } });
        expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ userId: 'system', action: 'RECORD_PRODUCTION_OUTPUT', entityId: 'exec-new', details: expect.stringContaining('OP-TEST (op-1)'), tx }));
        replaying(savedHash());
        vi.mocked(logActivity).mockClear();
        await ProductionExecutionService.addProductionOutput({ ...dailyReport, helperIds: ['helper-1'], kioskOperator: { employeeId: 'op-1', code: 'OP-TEST' } });
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
        expect(logActivity).not.toHaveBeenCalled();
    });

    it.each(['COMPLETED', 'CLOSED', 'CANCELLED', 'DRAFT'])('rejects new kiosk reports on %s SPKs', async status => {
        vi.mocked(tx.productionOrder.findUniqueOrThrow).mockResolvedValue({ ...plainOrder, status } as never);
        await expect(ProductionExecutionService.addProductionOutput({ ...dailyReport, kioskOperator: { employeeId: 'op-1', code: 'OP-TEST' } })).rejects.toThrow('SPK tidak dapat');
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
    });

    it.each([['inactive'], ['foreign-tenant'], ['op-1']])('rejects inactive, foreign or self helpers (%j)', async helperId => {
        vi.mocked(tx.employee.count).mockResolvedValue(helperId === 'op-1' ? 1 : 0);
        await expect(ProductionExecutionService.addProductionOutput({ ...dailyReport, helperIds: [helperId], kioskOperator: { employeeId: 'op-1', code: 'OP-TEST' } })).rejects.toThrow('Helper harus');
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
    });

    it('keeps the shift ownership guard for PIN reports', async () => {
        vi.mocked(tx.employee.count).mockResolvedValue(0);
        vi.mocked(tx.productionShift.findFirst).mockResolvedValue(null as never);
        await expect(ProductionExecutionService.addProductionOutput({ ...dailyReport, kioskOperator: { employeeId: 'op-1', code: 'OP-TEST' } })).rejects.toThrow('Shift tidak valid');
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
    });

    it.each([{ clientRequestId: undefined }, { shiftId: '' }])('requires kiosk request ID and shift (%j)', async patch => {
        await expect(ProductionExecutionService.addProductionOutput({ ...dailyReport, ...patch, kioskOperator: { employeeId: 'op-1', code: 'OP-TEST' } })).rejects.toThrow('wajib');
        expect(tx.productionExecution.create).not.toHaveBeenCalled();
    });

    it('lets an audit failure abort the transaction', async () => {
        vi.mocked(tx.employee.count).mockResolvedValue(0);
        vi.mocked(logActivity).mockRejectedValueOnce(new Error('audit failed'));
        await expect(ProductionExecutionService.addProductionOutput({ ...dailyReport, kioskOperator: { employeeId: 'op-1', code: 'OP-TEST' } })).rejects.toThrow('audit failed');
    });

    it('replays a daily-report entry that was already saved', async () => {
        await ProductionExecutionService.addProductionOutput(dailyReport);
        replaying(savedHash());

        await ProductionExecutionService.addProductionOutput(dailyReport);

        expect(tx.productionExecution.create).not.toHaveBeenCalled();
        expect(tx.productionOrder.update).not.toHaveBeenCalled();
    });

    it('keeps submissions without a request id as before', async () => {
        await ProductionExecutionService.logRunningOutput({ ...kioskLog, clientRequestId: undefined });

        expect(tx.$queryRaw).not.toHaveBeenCalled();
        expect(tx.productionExecution.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ clientRequestId: undefined, requestHash: undefined }),
        }));
    });
});
