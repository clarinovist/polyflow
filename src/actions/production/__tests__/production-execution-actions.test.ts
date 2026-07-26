import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    startExecution,
    stopExecution,
    logRunningOutput,
    addProductionOutput,
    getActiveExecutions,
    getProductionHistory,
    getProductionHistoryFilterOptions,
    voidProductionOutput,
    getOperatorTodaySummary,
} from '../production-execution';
import { prisma } from '@/lib/core/prisma';
import { ProductionService } from '@/services/production/production-service';
import {
    findActiveShift,
    findLatestShiftForOrder,
} from '@/services/production/shift-service';
import {
    requireAuth,
    requireProductionLeaderRole,
} from '@/lib/tools/auth-checks';
import { auth } from '@/auth';

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionExecution: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        machine: { findMany: vi.fn() },
        employee: { findMany: vi.fn() },
        productionShift: { findMany: vi.fn() },
        productVariant: { findMany: vi.fn() },
    },
}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(),
    requireProductionLeaderRole: vi.fn(),
}));

vi.mock('@/services/production/production-service', () => ({
    ProductionService: {
        startExecution: vi.fn(),
        stopExecution: vi.fn(),
        logRunningOutput: vi.fn(),
        addProductionOutput: vi.fn(),
        getActiveExecutions: vi.fn(),
        voidExecution: vi.fn(),
    },
}));

vi.mock('@/services/production/shift-service', () => ({
    findActiveShift: vi.fn(),
    findLatestShiftForOrder: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const SESSION = { user: { id: 'user-1' } };

const startInput = {
    productionOrderId: 'po-1',
    machineId: 'mac-1',
    operatorId: 'op-1',
};

/** What the service was asked to start, on its most recent call. */
function startArgs() {
    return vi.mocked(ProductionService.startExecution).mock
        .calls[0][0] as Record<string, unknown>;
}

describe('production execution actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireAuth).mockResolvedValue(SESSION as never);
        vi.mocked(requireProductionLeaderRole).mockResolvedValue(
            SESSION as never,
        );
        vi.mocked(ProductionService.startExecution).mockResolvedValue({
            id: 'exec-1',
        } as never);
        vi.mocked(findActiveShift).mockResolvedValue(null as never);
        vi.mocked(findLatestShiftForOrder).mockResolvedValue(null as never);
    });

    describe('startExecution shift resolution', () => {
        it('keeps an explicitly chosen shift and looks nothing up', async () => {
            // Act
            await startExecution({
                ...startInput,
                shiftId: 'shift-explicit',
            } as never);

            // Assert
            expect(findActiveShift).not.toHaveBeenCalled();
            expect(startArgs()).toMatchObject({ shiftId: 'shift-explicit' });
        });

        it('auto-detects the shift active right now', async () => {
            // Arrange
            vi.mocked(findActiveShift).mockResolvedValue({
                id: 'shift-active',
                operatorId: null,
            } as never);

            // Act
            await startExecution(startInput as never);

            // Assert
            expect(startArgs()).toMatchObject({
                shiftId: 'shift-active',
                operatorId: 'op-1',
            });
        });

        it('lets the active shift override the operator it was assigned to', async () => {
            // Arrange
            vi.mocked(findActiveShift).mockResolvedValue({
                id: 'shift-active',
                operatorId: 'op-from-shift',
            } as never);

            // Act
            await startExecution(startInput as never);

            // Assert
            expect(startArgs()).toMatchObject({
                operatorId: 'op-from-shift',
            });
        });

        it('falls back to the latest shift when none is currently active', async () => {
            // Arrange — every shift window for this order has expired
            vi.mocked(findLatestShiftForOrder).mockResolvedValue({
                id: 'shift-latest',
                operatorId: null,
            } as never);

            // Act
            await startExecution(startInput as never);

            // Assert
            expect(findActiveShift).toHaveBeenCalled();
            expect(startArgs()).toMatchObject({ shiftId: 'shift-latest' });
        });

        it('takes the operator from the latest shift only when none was given', async () => {
            // Arrange
            vi.mocked(findLatestShiftForOrder).mockResolvedValue({
                id: 'shift-latest',
                operatorId: 'op-from-latest',
            } as never);

            // Act — caller supplied no operator
            await startExecution({
                productionOrderId: 'po-1',
                machineId: 'mac-1',
            } as never);

            // Assert
            expect(startArgs()).toMatchObject({
                operatorId: 'op-from-latest',
            });
        });

        it('does not let the latest shift overwrite a supplied operator', async () => {
            // Arrange
            vi.mocked(findLatestShiftForOrder).mockResolvedValue({
                id: 'shift-latest',
                operatorId: 'op-from-latest',
            } as never);

            // Act
            await startExecution(startInput as never);

            // Assert
            expect(startArgs()).toMatchObject({ operatorId: 'op-1' });
        });

        it('starts with no shift at all when nothing can be resolved', async () => {
            // Act
            await startExecution(startInput as never);

            // Assert
            expect(startArgs().shiftId).toBeUndefined();
        });

        it('reports a service failure as a failed envelope', async () => {
            // Arrange
            vi.mocked(ProductionService.startExecution).mockRejectedValue(
                new Error('machine busy'),
            );

            // Act
            const res = await startExecution(startInput as never);

            // Assert
            expect(res.success).toBe(false);
        });
    });

    describe('stopExecution', () => {
        const stopInput = {
            executionId: 'exec-1',
            quantityProduced: 10,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            completed: true,
            operatorId: 'op-1',
        };

        it('stops and attributes the run to the signed-in user', async () => {
            // Arrange
            vi.mocked(ProductionService.stopExecution).mockResolvedValue({
                id: 'exec-1',
            } as never);

            // Act
            const res = await stopExecution(stopInput as never);

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.stopExecution).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'user-1' }),
            );
        });

        it('rejects a payload the schema refuses', async () => {
            // Act
            const res = await stopExecution({
                executionId: '',
            } as never);

            // Assert
            expect(res.success).toBe(false);
            expect(ProductionService.stopExecution).not.toHaveBeenCalled();
        });
    });

    describe('logRunningOutput', () => {
        const logInput = {
            executionId: 'exec-1',
            quantityProduced: 5,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            notes: '',
            operatorId: 'op-1',
            shiftId: undefined,
        };

        it('logs partial output mid-run', async () => {
            // Arrange
            vi.mocked(ProductionService.logRunningOutput).mockResolvedValue({
                id: 'exec-1',
            } as never);

            // Act
            const res = await logRunningOutput(logInput as never);

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.logRunningOutput).toHaveBeenCalled();
        });
    });

    describe('addProductionOutput', () => {
        const outputInput = {
            productionOrderId: 'po-1',
            machineId: 'mac-1',
            operatorId: 'op-1',
            shiftId: 'shift-1',
            quantityProduced: 100,
            scrapQuantity: 0,
            scrapProngkolQty: 0,
            scrapDaunQty: 0,
            startTime: new Date('2026-07-01T01:00:00Z'),
            endTime: new Date('2026-07-01T09:00:00Z'),
            notes: '',
        };

        it('records output against the order', async () => {
            // Arrange
            vi.mocked(ProductionService.addProductionOutput).mockResolvedValue(
                undefined as never,
            );

            // Act
            const res = await addProductionOutput(outputInput as never);

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.addProductionOutput).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'user-1' }),
            );
        });

        it('refuses output with no shift, which the schema requires', async () => {
            // Act
            const res = await addProductionOutput({
                ...outputInput,
                shiftId: '',
            } as never);

            // Assert
            expect(res.success).toBe(false);
            expect(
                ProductionService.addProductionOutput,
            ).not.toHaveBeenCalled();
        });
    });

    describe('getActiveExecutions', () => {
        it('returns the running executions', async () => {
            // Arrange
            vi.mocked(ProductionService.getActiveExecutions).mockResolvedValue([
                { id: 'exec-1' },
            ] as never);

            // Act
            const res = await getActiveExecutions();

            // Assert
            expect(res.success).toBe(true);
            if (res.success) expect(res.data).toHaveLength(1);
        });

        it('degrades to an empty list so the kiosk keeps rendering', async () => {
            // Arrange
            vi.mocked(ProductionService.getActiveExecutions).mockRejectedValue(
                new Error('db down'),
            );

            // Act
            const res = await getActiveExecutions();

            // Assert
            expect(res).toEqual({ success: true, data: [] });
        });
    });

    describe('voidProductionOutput', () => {
        it('voids under a production leader', async () => {
            // Arrange
            vi.mocked(ProductionService.voidExecution).mockResolvedValue(
                undefined as never,
            );

            // Act
            const res = await voidProductionOutput('exec-1', 'po-1');

            // Assert
            expect(res.success).toBe(true);
            expect(requireProductionLeaderRole).toHaveBeenCalled();
            expect(ProductionService.voidExecution).toHaveBeenCalledWith(
                'exec-1',
                'user-1',
            );
        });

        it('fails when the service refuses the void', async () => {
            // Arrange
            vi.mocked(ProductionService.voidExecution).mockRejectedValue(
                new Error('already voided'),
            );

            // Act
            const res = await voidProductionOutput('exec-1', 'po-1');

            // Assert
            expect(res.success).toBe(false);
        });
    });

    describe('getProductionHistory', () => {
        /** One completed run, shaped like the include the action asks for. */
        function execRow(overrides: Record<string, unknown> = {}) {
            return {
                id: 'e1',
                productionOrderId: 'po-1',
                quantityProduced: 10,
                scrapQuantity: 2,
                scrapDaunQty: 0,
                scrapProngkolQty: 0,
                startTime: new Date('2026-07-01T01:00:00Z'),
                endTime: new Date('2026-07-01T09:00:00Z'),
                notes: 'catatan',
                photoUrl: 'https://example.test/p.jpg',
                status: 'COMPLETED',
                enteredQuantity: null,
                enteredUnit: null,
                bruto: null,
                bobin: null,
                cekGram: null,
                operator: { name: 'Budi' },
                machine: { code: 'M1' },
                shift: { shiftName: 'Pagi', operator: null },
                helpers: [],
                productionOrder: {
                    id: 'po-1',
                    orderNumber: 'WO-001',
                    bom: {
                        name: 'BOM Kantong',
                        productVariant: { name: 'Kantong 5kg' },
                    },
                },
                ...overrides,
            };
        }

        function rows(list: Array<Record<string, unknown>>) {
            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue(
                list as never,
            );
        }

        type HistoryWhere = {
            endTime: { not: null; gte: Date; lte: Date };
        } & Record<string, unknown>;

        /** The where/take the action handed to Prisma. */
        function lastQuery() {
            const calls = vi.mocked(prisma.productionExecution.findMany).mock
                .calls;
            return calls[calls.length - 1][0] as {
                where: HistoryWhere;
                take: number;
            };
        }

        beforeEach(() => {
            vi.mocked(auth).mockResolvedValue(SESSION as never);
            rows([]);
        });

        it('returns an empty history for an anonymous caller', async () => {
            // Arrange
            vi.mocked(auth).mockResolvedValue(null as never);

            // Act
            const res = await getProductionHistory();

            // Assert
            expect(res.success).toBe(true);
            if (res.success) {
                expect(
                    (res.data as { summary: { orderCount: number } }).summary
                        .orderCount,
                ).toBe(0);
            }
            expect(prisma.productionExecution.findMany).not.toHaveBeenCalled();
        });

        it('defaults to today and excludes voided runs', async () => {
            // Act
            await getProductionHistory();

            // Assert
            const { where } = lastQuery();
            expect(where.status).toEqual({ not: 'VOIDED' });
            expect(where.endTime.not).toBeNull();
            expect(where.endTime.gte).toBeInstanceOf(Date);
        });

        it('keeps voided runs when explicitly asked', async () => {
            // Act
            await getProductionHistory({ includeVoided: true });

            // Assert
            expect(lastQuery().where.status).toBeUndefined();
        });

        it('honours an explicit date range', async () => {
            // Act
            await getProductionHistory({ from: '2026-06-01', to: '2026-06-30' });

            // Assert
            const { where } = lastQuery();
            expect(where.endTime.gte.getTime()).toBeLessThan(
                where.endTime.lte.getTime(),
            );
        });

        it('treats a missing "from" as an open start', async () => {
            // Act
            await getProductionHistory({ to: '2026-06-30' });

            // Assert — reaches back to the 2020 floor, not today
            expect(
                lastQuery().where.endTime.gte.getUTCFullYear(),
            ).toBeLessThanOrEqual(2020);
        });

        it('caps the page size at 500 however large the request', async () => {
            // Act
            await getProductionHistory({ limit: 5000 });

            // Assert
            expect(lastQuery().take).toBe(500);
        });

        it.each([
            ['hasScrap', { hasScrap: true }, 'scrapQuantity'],
            ['machineId', { machineId: 'mac-1' }, 'machineId'],
            ['operatorId', { operatorId: 'op-1' }, 'operatorId'],
            ['shiftId', { shiftId: 'shift-1' }, 'shiftId'],
            [
                'productVariantId',
                { productVariantId: 'pv-1' },
                'productionOrder',
            ],
            ['missingPhoto', { missingPhoto: true }, 'OR'],
        ])('narrows the query by %s', async (_label, filter, key) => {
            // Act
            await getProductionHistory(filter as never);

            // Assert
            expect(lastQuery().where).toHaveProperty(key);
        });

        it('groups repeated runs of one order and totals them', async () => {
            // Arrange — two runs on the same order, one on another
            rows([
                execRow(),
                execRow({
                    id: 'e2',
                    quantityProduced: 5,
                    scrapQuantity: 1,
                    endTime: new Date('2026-07-01T17:00:00Z'),
                    machine: { code: 'M2' },
                    photoUrl: null,
                }),
                execRow({
                    id: 'e3',
                    productionOrderId: 'po-2',
                    quantityProduced: 3,
                    scrapQuantity: 0,
                    productionOrder: {
                        id: 'po-2',
                        orderNumber: 'WO-002',
                        bom: {
                            name: 'BOM Lain',
                            productVariant: { name: 'Produk Lain' },
                        },
                    },
                }),
            ]);

            // Act
            const res = await getProductionHistory();

            // Assert
            expect(res.success).toBe(true);
            if (!res.success) return;
            const data = res.data as {
                groups: Array<{
                    executions: unknown[];
                    totalQuantity: number;
                    machineCodes: string[];
                    photoCount: number;
                }>;
                summary: {
                    totalGood: number;
                    totalScrap: number;
                    executionCount: number;
                    orderCount: number;
                };
            };
            expect(data.summary.orderCount).toBe(2);
            expect(data.summary.executionCount).toBe(3);
            expect(data.summary.totalGood).toBe(18);
            expect(data.summary.totalScrap).toBe(3);

            const first = data.groups.find((g) => g.executions.length === 2)!;
            expect(first.totalQuantity).toBe(15);
            expect(first.machineCodes).toEqual(['M1', 'M2']);
            expect(first.photoCount).toBe(1);
        });

        it('prefers the shift operator over the execution operator', async () => {
            // Arrange
            rows([
                execRow({
                    shift: { shiftName: 'Pagi', operator: { name: 'Siti' } },
                }),
            ]);

            // Act
            const res = await getProductionHistory();

            // Assert
            if (!res.success) throw new Error('expected success');
            const groups = (
                res.data as { groups: Array<{ operatorNames: string[] }> }
            ).groups;
            expect(groups[0].operatorNames).toEqual(['Siti']);
        });

        it('searches order number, product, bom and notes', async () => {
            // Arrange
            rows([execRow(), execRow({ id: 'e2', productionOrderId: 'po-2' })]);

            // Act
            const res = await getProductionHistory({ q: 'KANTONG 5KG' });

            // Assert — case-insensitive, matched on product name
            if (!res.success) throw new Error('expected success');
            expect(
                (res.data as { summary: { executionCount: number } }).summary
                    .executionCount,
            ).toBe(2);
        });

        it('returns nothing when the search matches no run', async () => {
            // Arrange
            rows([execRow()]);

            // Act
            const res = await getProductionHistory({ q: 'tidak-ada' });

            // Assert
            if (!res.success) throw new Error('expected success');
            expect(
                (res.data as { summary: { orderCount: number } }).summary
                    .orderCount,
            ).toBe(0);
        });

        it('counts an order with no photo at all as missing a photo', async () => {
            // Arrange
            rows([execRow({ photoUrl: null })]);

            // Act
            const res = await getProductionHistory();

            // Assert
            if (!res.success) throw new Error('expected success');
            expect(
                (res.data as { summary: { missingPhotoCount: number } }).summary
                    .missingPhotoCount,
            ).toBe(1);
        });

        it('flags the result as truncated when the page fills up', async () => {
            // Arrange
            rows([execRow(), execRow({ id: 'e2' })]);

            // Act
            const res = await getProductionHistory({ limit: 2 });

            // Assert
            if (!res.success) throw new Error('expected success');
            expect(
                (res.data as { summary: { isTruncated: boolean } }).summary
                    .isTruncated,
            ).toBe(true);
        });

        it('tolerates a run with no machine, shift or quantities', async () => {
            // Arrange
            rows([
                execRow({
                    quantityProduced: null,
                    scrapQuantity: null,
                    machine: null,
                    shift: null,
                    operator: null,
                    startTime: null,
                    endTime: null,
                }),
            ]);

            // Act
            const res = await getProductionHistory();

            // Assert
            if (!res.success) throw new Error('expected success');
            const data = res.data as {
                groups: Array<{
                    machineCodes: string[];
                    operatorNames: string[];
                    shiftNames: string[];
                    latestEndTime: Date | null;
                }>;
                summary: { totalGood: number };
            };
            expect(data.summary.totalGood).toBe(0);
            expect(data.groups[0].machineCodes).toEqual([]);
            expect(data.groups[0].operatorNames).toEqual([]);
            expect(data.groups[0].shiftNames).toEqual([]);
            expect(data.groups[0].latestEndTime).toBeNull();
        });
    });

    describe('getProductionHistoryFilterOptions', () => {
        it('returns empty option lists for an anonymous caller', async () => {
            // Arrange
            vi.mocked(auth).mockResolvedValue(null as never);

            // Act
            const res = await getProductionHistoryFilterOptions();

            // Assert
            expect(res).toEqual({
                success: true,
                data: {
                    machines: [],
                    operators: [],
                    shifts: [],
                    products: [],
                },
            });
            expect(prisma.machine.findMany).not.toHaveBeenCalled();
        });

        it('loads active machines and staff for a signed-in caller', async () => {
            // Arrange
            vi.mocked(auth).mockResolvedValue(SESSION as never);
            vi.mocked(prisma.machine.findMany).mockResolvedValue([
                { id: 'mac-1', code: 'M1', name: 'Mesin 1' },
            ] as never);
            vi.mocked(prisma.employee.findMany).mockResolvedValue([] as never);
            vi.mocked(prisma.productionShift.findMany).mockResolvedValue(
                [] as never,
            );
            vi.mocked(prisma.productVariant.findMany).mockResolvedValue(
                [] as never,
            );

            // Act
            const res = await getProductionHistoryFilterOptions();

            // Assert
            expect(res.success).toBe(true);
            if (res.success) {
                expect(
                    (res.data as { machines: unknown[] }).machines,
                ).toHaveLength(1);
            }
        });
    });

    describe('getOperatorTodaySummary', () => {
        it('returns zeros when no operator is given', async () => {
            // Act
            const res = await getOperatorTodaySummary('');

            // Assert
            expect(res).toEqual({
                success: true,
                data: {
                    jobCount: 0,
                    goodQty: 0,
                    scrapQty: 0,
                    activeJobsCount: 0,
                },
            });
            expect(prisma.productionExecution.findMany).not.toHaveBeenCalled();
        });

        it('counts distinct orders, not executions, and sums the quantities', async () => {
            // Arrange — three runs across two orders
            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
                {
                    id: 'e1',
                    productionOrderId: 'po-1',
                    quantityProduced: 10,
                    scrapQuantity: 1,
                },
                {
                    id: 'e2',
                    productionOrderId: 'po-1',
                    quantityProduced: 5,
                    scrapQuantity: 0,
                },
                {
                    id: 'e3',
                    productionOrderId: 'po-2',
                    quantityProduced: 7,
                    scrapQuantity: 2,
                },
            ] as never);
            vi.mocked(prisma.productionExecution.count).mockResolvedValue(
                1 as never,
            );

            // Act
            const res = await getOperatorTodaySummary('op-1');

            // Assert
            expect(res).toEqual({
                success: true,
                data: {
                    jobCount: 2,
                    goodQty: 22,
                    scrapQty: 3,
                    activeJobsCount: 1,
                },
            });
        });

        it('treats null quantities as zero', async () => {
            // Arrange
            vi.mocked(prisma.productionExecution.findMany).mockResolvedValue([
                {
                    id: 'e1',
                    productionOrderId: 'po-1',
                    quantityProduced: null,
                    scrapQuantity: null,
                },
            ] as never);
            vi.mocked(prisma.productionExecution.count).mockResolvedValue(
                0 as never,
            );

            // Act
            const res = await getOperatorTodaySummary('op-1');

            // Assert
            expect(res).toMatchObject({
                data: { goodQty: 0, scrapQty: 0, jobCount: 1 },
            });
        });
    });
});
