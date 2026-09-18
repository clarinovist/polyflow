import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
        machineDowntime: {
            create: vi.fn(),
        },
        employee: {
            findUnique: vi.fn(),
        },
        processPieceRate: {
            findFirst: vi.fn(),
        },
        productVariant: {
            findUnique: vi.fn().mockResolvedValue({ id: 'pv-1', product: { type: 'FINISHED_GOOD' } }),
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
    recordExecutionQualityInspection: vi.fn(),
    recordFinishedGoodsOutput: vi.fn(),
    triggerProductionOutputJournal: vi.fn(),
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
import { __mockTx as tx } from '@/lib/core/prisma';
import { ProductionExecutionService } from '../execution-service';
import { productionOutputSchema } from '@/lib/schemas/production';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { backflushMaterials, recordFinishedGoodsOutput, recordExecutionScrap } from '../execution-helpers';

/**
 * Regresi shift-aware business time (plan 2026-09-01): entri otomatis hasil
 * shift malam yang dicatat setelah tengah malam harus di-backdate ke mulai
 * shift sehingga masuk bucket tanggal shift di Laporan Produksi Harian.
 * Waktu di-fake supaya deterministik; WIB = UTC+7.
 */
describe('ProductionExecutionService shift-aware business time', () => {
    const LOG_AT = new Date('2026-09-02T00:30:00.000+07:00'); // 00:30 WIB
    const SHIFT_START = new Date('2026-09-01T22:00:00.000+07:00'); // 22:00 WIB sebelumnya

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(LOG_AT);
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
        vi.mocked(tx.productionExecution.update).mockResolvedValue({ id: 'exec-1' } as never);
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
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('logRunningOutput (kiosk log)', () => {
        it('backdate start=end ke mulai shift saat log otomatis nyebrang tengah malam', async () => {
            vi.mocked(tx.productionShift.findUnique).mockResolvedValue({
                startTime: SHIFT_START,
            } as never);

            await ProductionExecutionService.logRunningOutput({
                executionId: 'exec-1',
                quantityProduced: 50,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                shiftId: 'shift-1',
                userId: 'user-1',
            });

            expect(tx.productionShift.findUnique).toHaveBeenCalledWith({
                where: { id: 'shift-1' },
                select: { startTime: true },
            });
            expect(tx.productionExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        startTime: SHIFT_START,
                        endTime: SHIFT_START,
                    }),
                }),
            );
        });

        it('tidak backdate saat shift mulai di hari yang sama dengan log', async () => {
            const sameDayShiftStart = new Date('2026-09-02T07:00:00.000+07:00');
            vi.mocked(tx.productionShift.findUnique).mockResolvedValue({
                startTime: sameDayShiftStart,
            } as never);

            await ProductionExecutionService.logRunningOutput({
                executionId: 'exec-1',
                quantityProduced: 50,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                shiftId: 'shift-1',
                userId: 'user-1',
            });

            expect(tx.productionExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        startTime: LOG_AT,
                        endTime: LOG_AT,
                    }),
                }),
            );
        });

        it('tanpa shift → start = end = waktu log', async () => {
            vi.mocked(tx.productionShift.findUnique).mockResolvedValue(null);

            await ProductionExecutionService.logRunningOutput({
                executionId: 'exec-1',
                quantityProduced: 50,
                scrapQuantity: 0,
                scrapProngkolQty: 0,
                scrapDaunQty: 0,
                notes: '',
                shiftId: undefined,
                userId: 'user-1',
            });

            expect(tx.productionExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        startTime: LOG_AT,
                        endTime: LOG_AT,
                    }),
                }),
            );
        });
    });

    describe('addProductionOutput (dialog desktop / batch form)', () => {
        const datedInput = (productionDate: string) => ({
            ...productionOutputSchema.parse({
                productionOrderId: 'po-1', shiftId: 'shift-1',
                quantityProduced: 50, scrapQuantity: 0,
                scrapProngkolQty: 2, scrapDaunQty: 3,
                startTime: LOG_AT, endTime: LOG_AT,
            }),
            productionDate,
            userId: 'user-1',
        });

        it.each(['2026-09-02', '2026-08-20'])(
            'persists date %s for both report timestamps without backdating audit or posting', async (productionDate) => {
                vi.mocked(tx.productionShift.findFirst).mockResolvedValue({
                    id: 'shift-1', startTime: SHIFT_START,
                });
                await ProductionExecutionService.addProductionOutput(datedInput(productionDate));

                const data = vi.mocked(tx.productionExecution.create).mock.calls[0][0].data;
                expect(toBusinessDateString(data.startTime)).toBe(productionDate);
                expect(data.endTime).toEqual(data.startTime);
                expect(data).not.toHaveProperty('createdAt');
                expect(tx.productionOrder.update).toHaveBeenCalledWith(expect.objectContaining({
                    data: { actualQuantity: { increment: 50 } },
                }));
                expect(backflushMaterials).toHaveBeenCalledWith(expect.objectContaining({
                    tx, productionOrderId: 'po-1', totalConsumed: 55, userId: 'user-1',
                }));
                expect(recordFinishedGoodsOutput).toHaveBeenCalledWith(expect.objectContaining({
                    tx, productionOrderId: 'po-1', quantityProduced: 50,
                }));
                expect(recordExecutionScrap).toHaveBeenCalledWith(expect.objectContaining({
                    tx, executionId: 'exec-new', scrapProngkolQty: 2, scrapDaunQty: 3,
                }));
                // Dates are execution-only; stock/journal helpers retain current posting semantics.
                const posting = vi.mocked(recordFinishedGoodsOutput).mock.calls[0][0];
                expect(posting).not.toHaveProperty('productionDate');
                expect(posting).not.toHaveProperty('createdAt');
            },
        );

        it.each(['', '2026-02-30', '2026-09-03'])(
            'rejects date %s even for direct service callers before any mutations', async (productionDate) => {
                vi.mocked(tx.productionShift.findFirst).mockResolvedValue({
                    id: 'shift-1', startTime: SHIFT_START,
                });
                await expect(ProductionExecutionService.addProductionOutput(datedInput(productionDate)))
                    .rejects.toThrow(/Tanggal produksi/);
                expect(tx.productionExecution.create).not.toHaveBeenCalled();
                expect(tx.productionOrder.update).not.toHaveBeenCalled();
                expect(backflushMaterials).not.toHaveBeenCalled();
                expect(recordFinishedGoodsOutput).not.toHaveBeenCalled();
            },
        );

        it('still rejects a shift outside the WO before writes', async () => {
            vi.mocked(tx.productionShift.findFirst).mockResolvedValue(null);
            await expect(ProductionExecutionService.addProductionOutput(datedInput('2026-09-01')))
                .rejects.toThrow('Shift tidak valid');
            expect(tx.productionExecution.create).not.toHaveBeenCalled();
        });

        it('propagates stock failure from the transaction instead of reporting success', async () => {
            vi.mocked(tx.productionShift.findFirst).mockResolvedValue({
                id: 'shift-1', startTime: SHIFT_START,
            });
            vi.mocked(backflushMaterials).mockRejectedValueOnce(new Error('Stock insufficient'));
            await expect(ProductionExecutionService.addProductionOutput(datedInput('2026-09-01')))
                .rejects.toThrow('Stock insufficient');
            expect(recordFinishedGoodsOutput).not.toHaveBeenCalled();
            expect(recordExecutionScrap).not.toHaveBeenCalled();
        });

        it('backdate saat dialog kirim waktu submit otomatis nyebrang tengah malam', async () => {
            vi.mocked(tx.productionShift.findFirst).mockResolvedValue({
                id: 'shift-1',
                startTime: SHIFT_START,
            } as never);

            await ProductionExecutionService.addProductionOutput({
                productionOrderId: 'po-1',
                shiftId: 'shift-1',
                quantityProduced: 50,
                scrapQuantity: 0,
                startTime: new Date(LOG_AT),
                endTime: new Date(LOG_AT),
                userId: 'user-1',
            } as never);

            expect(tx.productionExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        startTime: SHIFT_START,
                        endTime: SHIFT_START,
                    }),
                }),
            );
        });

        it('menghormati waktu deliberate user (batch form diedit, deviasi > 15 menit)', async () => {
            const editedStart = new Date('2026-09-01T23:15:00.000+07:00');
            const editedEnd = new Date('2026-09-02T00:20:00.000+07:00');
            vi.mocked(tx.productionShift.findFirst).mockResolvedValue({
                id: 'shift-1',
                startTime: SHIFT_START,
            } as never);

            await ProductionExecutionService.addProductionOutput({
                productionOrderId: 'po-1',
                shiftId: 'shift-1',
                quantityProduced: 50,
                scrapQuantity: 0,
                startTime: editedStart,
                endTime: editedEnd,
                userId: 'user-1',
            } as never);

            expect(tx.productionExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        startTime: editedStart,
                        endTime: editedEnd,
                    }),
                }),
            );
        });

        it('tanpa shiftId → waktu client tetap dipakai (tidak backdate)', async () => {
            const clientTime = new Date(LOG_AT);

            await ProductionExecutionService.addProductionOutput({
                productionOrderId: 'po-1',
                quantityProduced: 50,
                scrapQuantity: 0,
                startTime: clientTime,
                endTime: clientTime,
                userId: 'user-1',
            } as never);

            expect(tx.productionShift.findFirst).not.toHaveBeenCalled();
            expect(tx.productionExecution.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        startTime: clientTime,
                        endTime: clientTime,
                    }),
                }),
            );
        });
    });
});
