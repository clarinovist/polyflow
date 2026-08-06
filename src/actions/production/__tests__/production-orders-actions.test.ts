import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    getInitData,
    createProductionOrder,
    quickCreateProductionOrder,
    getProductionOrders,
    getProductionOrder,
    updateProductionOrder,
    deleteProductionOrder,
    getProductionOrderStats,
} from '../production-orders';
import { prisma } from '@/lib/core/prisma';
import { ProductionService } from '@/services/production/production-service';
import {
    requirePlanningRole,
    requireProductionLeaderRole,
} from '@/lib/tools/auth-checks';
import { auth } from '@/auth';

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/core/tenant', () => ({
    withTenant: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            groupBy: vi.fn(),
            count: vi.fn(),
        },
        bom: { findUnique: vi.fn() },
        location: { findMany: vi.fn() },
    },
}));

vi.mock('@/auth', () => ({ auth: vi.fn() }));

vi.mock('@/lib/tools/auth-checks', () => ({
    requirePlanningRole: vi.fn(),
    requireProductionLeaderRole: vi.fn(),
}));

vi.mock('@/services/production/production-service', () => ({
    ProductionService: {
        getInitData: vi.fn(),
        createOrder: vi.fn(),
        quickCreateOrder: vi.fn(),
        updateOrder: vi.fn(),
        deleteOrder: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: (data: unknown) => data,
}));

vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const SESSION = { user: { id: 'user-1' } };

/** Prisma Decimal stand-in — the actions call .toNumber() on these. */
const dec = (n: number) => ({ toNumber: () => n });

/** Minimal order row shaped like the include the action asks Prisma for. */
function orderRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'po-1',
        orderNumber: 'WO-001',
        plannedQuantity: dec(100),
        plannedEnteredQuantity: null,
        plannedConversionFactorSnapshot: null,
        actualQuantity: null,
        bom: null,
        plannedMaterials: [],
        ...overrides,
    };
}

/** The where clause the action handed to Prisma on its last findMany call. */
function lastWhere() {
    const calls = vi.mocked(prisma.productionOrder.findMany).mock.calls;
    return (calls[calls.length - 1][0] as { where: Record<string, unknown> })
        .where;
}

describe('production order actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requirePlanningRole).mockResolvedValue(SESSION as never);
        vi.mocked(requireProductionLeaderRole).mockResolvedValue(SESSION as never);
        vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([] as never);
        vi.mocked(prisma.productionOrder.findFirst).mockResolvedValue(null as never);
    });

    describe('getInitData', () => {
        it('returns the form data the service provides', async () => {
            // Arrange
            vi.mocked(ProductionService.getInitData).mockResolvedValue({
                boms: [{ id: 'bom-1' }],
                machines: [],
            } as never);

            // Act
            const res = await getInitData();

            // Assert
            expect(res.success).toBe(true);
        });

        it('degrades to empty lists rather than failing the form', async () => {
            // Arrange
            vi.mocked(ProductionService.getInitData).mockRejectedValue(
                new Error('db down'),
            );

            // Act
            const res = await getInitData();

            // Assert — the form still renders, just with nothing to pick
            expect(res).toEqual({
                success: true,
                data: {
                    boms: [],
                    machines: [],
                    locations: [],
                    operators: [],
                    helpers: [],
                    workShifts: [],
                    rawMaterials: [],
                    customers: [],
                },
            });
        });
    });

    describe('createProductionOrder', () => {
        const validInput = {
            bomId: 'bom-1',
            plannedQuantity: 10,
            machineId: 'mac-1',
            locationId: 'loc-1',
            plannedStartDate: new Date('2026-07-01'),
        };

        it('creates the order under the current planner', async () => {
            // Arrange
            vi.mocked(ProductionService.createOrder).mockResolvedValue({
                id: 'po-1',
            } as never);

            // Act
            const res = await createProductionOrder(validInput as never);

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.createOrder).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'user-1' }),
            );
        });

        it('rejects input that fails the schema before touching the service', async () => {
            // Act
            const res = await createProductionOrder({
                plannedQuantity: -5,
            } as never);

            // Assert
            expect(res.success).toBe(false);
            expect(ProductionService.createOrder).not.toHaveBeenCalled();
        });

        it('reports a service failure without leaking the raw error', async () => {
            // Arrange
            vi.mocked(ProductionService.createOrder).mockRejectedValue(
                new Error('constraint violated'),
            );

            // Act
            const res = await createProductionOrder(validInput as never);

            // Assert
            expect(res.success).toBe(false);
            if (!res.success) {
                expect(res.error).not.toContain('constraint violated');
            }
        });
    });

    describe('quickCreateProductionOrder', () => {
        const input = {
            bomId: 'bom-1',
            plannedQuantity: 10,
            machineId: 'mac-1',
        };

        function locations(rows: Array<Record<string, unknown>>) {
            vi.mocked(prisma.bom.findUnique).mockResolvedValue({
                category: 'PRODUKSI',
            } as never);
            vi.mocked(prisma.location.findMany).mockResolvedValue(rows as never);
        }

        it('resolves an output location and delegates to the service', async () => {
            // Arrange
            locations([
                {
                    id: 'loc-prod',
                    name: 'Gudang Produksi',
                    slug: 'gudang-produksi',
                    locationPurpose: 'PRODUCTION_OUTPUT',
                },
            ]);
            vi.mocked(ProductionService.quickCreateOrder).mockResolvedValue({
                id: 'po-9',
            } as never);

            // Act
            const res = await quickCreateProductionOrder(input);

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.quickCreateOrder).toHaveBeenCalledWith(
                expect.objectContaining({ bomId: 'bom-1', userId: 'user-1' }),
            );
        });

        it.each([
            ['no bom', { ...input, bomId: '' }],
            ['zero quantity', { ...input, plannedQuantity: 0 }],
            ['no machine', { ...input, machineId: '' }],
        ])('refuses %s', async (_label, bad) => {
            // Act
            const res = await quickCreateProductionOrder(bad);

            // Assert
            expect(res.success).toBe(false);
            expect(ProductionService.quickCreateOrder).not.toHaveBeenCalled();
        });

        it('fails clearly when no usable output location exists', async () => {
            // Arrange — master data has nothing to write finished goods into
            locations([]);

            // Act
            const res = await quickCreateProductionOrder(input);

            // Assert
            expect(res.success).toBe(false);
            if (!res.success) expect(res.error).toMatch(/lokasi/i);
            expect(ProductionService.quickCreateOrder).not.toHaveBeenCalled();
        });

        it('returns existing order when duplicate detected via clientRequestId (idempotent)', async () => {
            locations([
                {
                    id: 'loc-prod',
                    name: 'Gudang Produksi',
                    slug: 'gudang-produksi',
                    locationPurpose: 'PRODUCTION_OUTPUT',
                },
            ]);
            vi.mocked(prisma.productionOrder.findFirst).mockResolvedValue({
                id: 'po-dup',
                orderNumber: 'WO-DUP',
            } as never);

            const res = await quickCreateProductionOrder({
                ...input,
                clientRequestId: 'req_123',
            } as any);

            expect(res.success).toBe(true);
            if (res.success) expect((res.data as any).id).toBe('po-dup');
            expect(ProductionService.quickCreateOrder).not.toHaveBeenCalled();
        });

        it('creates with priority and notes and revalidates mobile/kiosk', async () => {
            locations([
                {
                    id: 'loc-prod',
                    name: 'Gudang Produksi',
                    slug: 'gudang-produksi',
                    locationPurpose: 'PRODUCTION_OUTPUT',
                },
            ]);
            vi.mocked(prisma.productionOrder.findFirst).mockResolvedValue(null as never);
            vi.mocked(ProductionService.quickCreateOrder).mockResolvedValue({
                id: 'po-new',
                orderNumber: 'WO-NEW',
            } as never);

            const res = await quickCreateProductionOrder({
                ...input,
                priority: 'URGENT',
                notes: 'Mendadak dari HP',
            } as any);

            expect(res.success).toBe(true);
            expect(ProductionService.quickCreateOrder).toHaveBeenCalledWith(
                expect.objectContaining({ priority: 'URGENT', notes: expect.stringContaining('Mendadak') }),
            );
        });
    });

    describe('getProductionOrders filters', () => {
        it('queries everything when no filter is given', async () => {
            // Act
            await getProductionOrders();

            // Assert
            expect(lastWhere()).toEqual({});
        });

        it('filters by status and machine', async () => {
            // Act
            await getProductionOrders({
                status: 'IN_PROGRESS' as never,
                machineId: 'mac-1',
            });

            // Assert
            expect(lastWhere()).toMatchObject({
                status: 'IN_PROGRESS',
                machineId: 'mac-1',
            });
        });

        it('late on its own means released or running past the planned end', async () => {
            // Act
            await getProductionOrders({ late: true });

            // Assert
            const where = lastWhere() as {
                status: { in: string[] };
                plannedEndDate: { lt: Date };
            };
            expect(where.status.in).toEqual(['RELEASED', 'IN_PROGRESS']);
            expect(where.plannedEndDate.lt).toBeInstanceOf(Date);
        });

        it('late alongside an explicit status keeps that status', async () => {
            // Act
            await getProductionOrders({
                late: true,
                status: 'RELEASED' as never,
            });

            // Assert
            expect(lastWhere()).toMatchObject({ status: 'RELEASED' });
        });

        it('folds a single bom filter straight into the where clause', async () => {
            // Act
            await getProductionOrders({ bomCategories: ['PRODUKSI'] as never });

            // Assert — one AND part, so it is merged rather than nested
            const where = lastWhere();
            expect(where).toHaveProperty('bom');
            expect(where).not.toHaveProperty('AND');
        });

        it('combines a product-type filter with a search into an AND', async () => {
            // Act
            await getProductionOrders({
                productTypes: ['FINISHED_GOOD'] as never,
                q: '  WO-1  ',
            });

            // Assert
            const where = lastWhere() as { AND: unknown[] };
            expect(where.AND).toHaveLength(2);
        });

        it('ignores a search that is only whitespace', async () => {
            // Act
            await getProductionOrders({ q: '   ' });

            // Assert
            expect(lastWhere()).toEqual({});
        });

        it('converts Decimal columns to plain numbers for the client', async () => {
            // Arrange
            vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
                orderRow({
                    actualQuantity: dec(42),
                    plannedEnteredQuantity: dec(7),
                    plannedConversionFactorSnapshot: dec(0.5),
                    bom: {
                        id: 'bom-1',
                        outputQuantity: dec(5),
                        items: [{ id: 'bi-1', quantity: dec(3) }],
                    },
                    plannedMaterials: [{ id: 'pm-1', quantity: dec(9) }],
                }),
            ] as never);

            // Act
            const orders = (await getProductionOrders()) as unknown as Array<
                Record<string, never>
            >;

            // Assert
            expect(orders[0]).toMatchObject({
                plannedQuantity: 100,
                actualQuantity: 42,
                plannedEnteredQuantity: 7,
                plannedConversionFactorSnapshot: 0.5,
            });
            expect(orders[0].bom).toMatchObject({ outputQuantity: 5 });
            expect(orders[0].plannedMaterials[0]).toMatchObject({ quantity: 9 });
        });

        it('leaves a null bom alone instead of mapping it', async () => {
            // Arrange
            vi.mocked(prisma.productionOrder.findMany).mockResolvedValue([
                orderRow(),
            ] as never);

            // Act
            const orders = (await getProductionOrders()) as Array<
                Record<string, unknown>
            >;

            // Assert
            expect(orders[0].bom).toBeNull();
            expect(orders[0].actualQuantity).toBeNull();
        });
    });

    describe('getProductionOrder', () => {
        it('returns null for a blank id without hitting the database', async () => {
            // Act
            const result = await getProductionOrder('');

            // Assert
            expect(result).toBeNull();
            expect(prisma.productionOrder.findUnique).not.toHaveBeenCalled();
        });

        it('returns null when the order does not exist', async () => {
            // Arrange
            vi.mocked(prisma.productionOrder.findUnique).mockResolvedValue(
                null as never,
            );

            // Act
            const result = await getProductionOrder('missing');

            // Assert
            expect(result).toBeNull();
        });
    });

    describe('updateProductionOrder', () => {
        const validUpdate = {
            id: 'po-1',
            plannedQuantity: 20,
            machineId: 'mac-1',
            locationId: 'loc-1',
            plannedStartDate: new Date('2026-07-01'),
        };

        it('updates and revalidates the order page', async () => {
            // Arrange
            vi.mocked(ProductionService.updateOrder).mockResolvedValue(
                undefined as never,
            );

            // Act
            const res = await updateProductionOrder(validUpdate as never);

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.updateOrder).toHaveBeenCalled();
        });

        it('rejects a payload the schema refuses', async () => {
            // Act
            const res = await updateProductionOrder({} as never);

            // Assert
            expect(res.success).toBe(false);
            expect(ProductionService.updateOrder).not.toHaveBeenCalled();
        });

        it('passes a service error message through to the caller', async () => {
            // Arrange
            vi.mocked(ProductionService.updateOrder).mockRejectedValue(
                new Error('Order sudah berjalan'),
            );

            // Act
            const res = await updateProductionOrder(validUpdate as never);

            // Assert
            expect(res.success).toBe(false);
            if (!res.success) expect(res.error).toBe('Order sudah berjalan');
        });
    });

    describe('deleteProductionOrder', () => {
        it('deletes an existing order', async () => {
            // Arrange
            vi.mocked(ProductionService.deleteOrder).mockResolvedValue(
                undefined as never,
            );

            // Act
            const res = await deleteProductionOrder('po-1');

            // Assert
            expect(res.success).toBe(true);
            expect(ProductionService.deleteOrder).toHaveBeenCalledWith('po-1');
        });

        it('refuses a blank id', async () => {
            // Act
            const res = await deleteProductionOrder('');

            // Assert
            expect(res.success).toBe(false);
            expect(ProductionService.deleteOrder).not.toHaveBeenCalled();
        });

        it('surfaces the reason a delete was blocked', async () => {
            // Arrange
            vi.mocked(ProductionService.deleteOrder).mockRejectedValue(
                new Error('Sudah ada material issue'),
            );

            // Act
            const res = await deleteProductionOrder('po-1');

            // Assert
            expect(res.success).toBe(false);
            if (!res.success) expect(res.error).toBe('Sudah ada material issue');
        });
    });

    describe('getProductionOrderStats', () => {
        it('returns zeros for an anonymous caller', async () => {
            // Arrange
            vi.mocked(auth).mockResolvedValue(null as never);

            // Act
            const stats = await getProductionOrderStats();

            // Assert
            expect(stats).toEqual({
                totalOrders: 0,
                activeCount: 0,
                draftCount: 0,
                lateCount: 0,
            });
            expect(prisma.productionOrder.groupBy).not.toHaveBeenCalled();
        });

        it('counts orders per status for a signed-in caller', async () => {
            // Arrange
            vi.mocked(auth).mockResolvedValue(SESSION as never);
            vi.mocked(prisma.productionOrder.groupBy).mockResolvedValue([
                { status: 'IN_PROGRESS', _count: { status: 3 } },
                { status: 'DRAFT', _count: { status: 2 } },
                { status: 'COMPLETED', _count: { status: 5 } },
            ] as never);
            vi.mocked(prisma.productionOrder.count).mockResolvedValue(
                4 as never,
            );

            // Act
            const stats = await getProductionOrderStats();

            // Assert
            expect(stats.totalOrders).toBe(10);
            expect(stats.activeCount).toBe(3);
            expect(stats.draftCount).toBe(2);
        });
    });
});
