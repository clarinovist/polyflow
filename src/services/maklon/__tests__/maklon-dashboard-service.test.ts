import { Prisma, ProductionStatus, Unit } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    collectMaklonDashboard,
    createMaklonDashboardReader,
    readMaklonDashboard,
    type MaklonDashboardAggregate,
    type MaklonDashboardReader,
} from '../maklon-dashboard-service';

const db = {
    productionOrder: {
        count: vi.fn(),
        findMany: vi.fn(),
    },
    productionExecution: {
        groupBy: vi.fn(),
    },
};

const snapshotAt = new Date('2026-10-09T17:30:00.000Z');
const startOfDay = new Date('2026-10-09T17:00:00.000Z');
const endOfDay = new Date('2026-10-10T16:59:59.999Z');

function reader(
    overrides: Partial<MaklonDashboardReader> = {},
): MaklonDashboardReader {
    return {
        readInProgress: async () => ({ count: 0 }),
        readCompletedToday: async () => ({ count: 0 }),
        readOutputTodayByUnit: async () => ({ groups: [] }),
        readWaitingMaterial: async () => ({ count: 0 }),
        readPastPlannedEnd: async () => ({ count: 0 }),
        ...overrides,
    };
}

function statusFromWhere(where: { status?: unknown }): string | undefined {
    return typeof where.status === 'string' ? where.status : undefined;
}

describe('Maklon dashboard service', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        db.productionOrder.count.mockImplementation(
            async ({ where }: { where: { status?: unknown } }) => {
                const status = statusFromWhere(where);
                if (status === ProductionStatus.IN_PROGRESS) return 3;
                if (status === ProductionStatus.COMPLETED) return 2;
                if (status === ProductionStatus.WAITING_MATERIAL) return 4;
                return 1;
            },
        );
        db.productionExecution.groupBy.mockResolvedValue([]);
        db.productionOrder.findMany.mockResolvedValue([]);
    });

    it('uses only the signed Maklon predicates, canonical WIB bounds, and one shared snapshot instant', async () => {
        const result = await readMaklonDashboard(db as never, { snapshotAt });

        expect(result.generatedAt).toBe(snapshotAt.toISOString());
        expect(result.snapshotAt).toBe(snapshotAt.toISOString());
        expect(result.workDate).toBe('2026-10-10');
        expect(result.health.inProgress).toEqual({
            state: 'AVAILABLE',
            data: { count: 3 },
        });
        expect(result.health.completedToday).toEqual({
            state: 'AVAILABLE',
            data: { count: 2 },
        });
        expect(result.attention.waitingMaterial).toEqual({
            state: 'AVAILABLE',
            data: { count: 4 },
        });
        expect(result.attention.pastPlannedEnd).toEqual({
            state: 'AVAILABLE',
            data: { count: 1 },
        });

        expect(db.productionOrder.count).toHaveBeenCalledTimes(4);
        expect(db.productionOrder.count).toHaveBeenCalledWith({
            where: {
                isMaklon: true,
                status: ProductionStatus.IN_PROGRESS,
            },
        });
        expect(db.productionOrder.count).toHaveBeenCalledWith({
            where: {
                isMaklon: true,
                status: ProductionStatus.COMPLETED,
                actualEndDate: { gte: startOfDay, lte: endOfDay },
            },
        });
        expect(db.productionOrder.count).toHaveBeenCalledWith({
            where: {
                isMaklon: true,
                status: ProductionStatus.WAITING_MATERIAL,
            },
        });
        expect(db.productionOrder.count).toHaveBeenCalledWith({
            where: {
                isMaklon: true,
                status: {
                    in: [
                        ProductionStatus.RELEASED,
                        ProductionStatus.IN_PROGRESS,
                    ],
                },
                plannedEndDate: { not: null, lt: snapshotAt },
            },
        });

        const serializedCalls = JSON.stringify(
            db.productionOrder.count.mock.calls,
        );
        expect(serializedCalls).not.toContain(ProductionStatus.DRAFT);
        expect(serializedCalls).not.toContain(ProductionStatus.CANCELLED);
    });

    it('counts in-progress and waiting-material only for exact Maklon statuses across the complete status set', async () => {
        const rows = Object.values(ProductionStatus).flatMap((status) => [
            { isMaklon: true, status },
            { isMaklon: false, status },
        ]);
        db.productionOrder.count.mockImplementation(
            async ({ where }: { where: Record<string, unknown> }) =>
                rows.filter(
                    (row) =>
                        row.isMaklon === where.isMaklon &&
                        row.status === where.status,
                ).length,
        );
        const serviceReader = createMaklonDashboardReader(db as never);

        await expect(serviceReader.readInProgress()).resolves.toEqual({
            count: 1,
        });
        await expect(serviceReader.readWaitingMaterial()).resolves.toEqual({
            count: 1,
        });

        expect(db.productionOrder.count).toHaveBeenNthCalledWith(1, {
            where: {
                isMaklon: true,
                status: ProductionStatus.IN_PROGRESS,
            },
        });
        expect(db.productionOrder.count).toHaveBeenNthCalledWith(2, {
            where: {
                isMaklon: true,
                status: ProductionStatus.WAITING_MATERIAL,
            },
        });
    });

    it('includes completed start/end boundaries, excludes null/outside/non-Maklon rows, and keeps exact COMPLETED status', async () => {
        const rows = [
            { isMaklon: true, status: 'COMPLETED', actualEndDate: startOfDay },
            { isMaklon: true, status: 'COMPLETED', actualEndDate: endOfDay },
            {
                isMaklon: true,
                status: 'COMPLETED',
                actualEndDate: new Date(startOfDay.getTime() - 1),
            },
            {
                isMaklon: true,
                status: 'COMPLETED',
                actualEndDate: new Date(endOfDay.getTime() + 1),
            },
            { isMaklon: true, status: 'COMPLETED', actualEndDate: null },
            {
                isMaklon: true,
                status: 'IN_PROGRESS',
                actualEndDate: startOfDay,
            },
            { isMaklon: false, status: 'COMPLETED', actualEndDate: startOfDay },
        ];
        db.productionOrder.count.mockImplementationOnce(
            async ({ where }: { where: Record<string, unknown> }) => {
                const date = where.actualEndDate as { gte: Date; lte: Date };
                return rows.filter(
                    (row) =>
                        row.isMaklon === where.isMaklon &&
                        row.status === where.status &&
                        row.actualEndDate !== null &&
                        row.actualEndDate >= date.gte &&
                        row.actualEndDate <= date.lte,
                ).length;
            },
        );

        const result = await createMaklonDashboardReader(
            db as never,
        ).readCompletedToday({ startOfDay, endOfDay });

        expect(result).toEqual({ count: 2 });
    });

    it('counts only past non-null planned end in RELEASED/IN_PROGRESS and excludes equal/future/all other statuses', async () => {
        const rows = [
            {
                isMaklon: true,
                status: 'RELEASED',
                plannedEndDate: new Date(snapshotAt.getTime() - 1),
            },
            {
                isMaklon: true,
                status: 'IN_PROGRESS',
                plannedEndDate: new Date(snapshotAt.getTime() - 1),
            },
            {
                isMaklon: true,
                status: 'IN_PROGRESS',
                plannedEndDate: snapshotAt,
            },
            {
                isMaklon: true,
                status: 'RELEASED',
                plannedEndDate: new Date(snapshotAt.getTime() + 1),
            },
            ...Object.values(ProductionStatus)
                .filter(
                    (status) =>
                        status !== ProductionStatus.RELEASED &&
                        status !== ProductionStatus.IN_PROGRESS,
                )
                .map((status) => ({
                    isMaklon: true,
                    status,
                    plannedEndDate: new Date(snapshotAt.getTime() - 1),
                })),
            { isMaklon: true, status: 'RELEASED', plannedEndDate: null },
            {
                isMaklon: false,
                status: 'RELEASED',
                plannedEndDate: new Date(snapshotAt.getTime() - 1),
            },
        ];
        db.productionOrder.count.mockImplementationOnce(
            async ({ where }: { where: Record<string, unknown> }) => {
                const status = where.status as { in: string[] };
                const date = where.plannedEndDate as {
                    not: null;
                    lt: Date;
                };
                return rows.filter(
                    (row) =>
                        row.isMaklon === where.isMaklon &&
                        status.in.includes(row.status) &&
                        row.plannedEndDate !== null &&
                        row.plannedEndDate < date.lt,
                ).length;
            },
        );

        const result = await createMaklonDashboardReader(
            db as never,
        ).readPastPlannedEnd(snapshotAt);

        expect(result).toEqual({ count: 2 });
    });

    it('executes output day, VOIDED, and Maklon relation predicates before grouping by order', async () => {
        const executions = [
            {
                productionOrderId: 'eligible-start',
                status: 'COMPLETED',
                startTime: startOfDay,
                isMaklon: true,
                quantity: new Prisma.Decimal('1.25'),
            },
            {
                productionOrderId: 'eligible-end',
                status: 'COMPLETED',
                startTime: endOfDay,
                isMaklon: true,
                quantity: new Prisma.Decimal('2.75'),
            },
            {
                productionOrderId: 'voided',
                status: 'VOIDED',
                startTime: startOfDay,
                isMaklon: true,
                quantity: new Prisma.Decimal('100'),
            },
            {
                productionOrderId: 'non-maklon',
                status: 'COMPLETED',
                startTime: startOfDay,
                isMaklon: false,
                quantity: new Prisma.Decimal('100'),
            },
            {
                productionOrderId: 'before',
                status: 'COMPLETED',
                startTime: new Date(startOfDay.getTime() - 1),
                isMaklon: true,
                quantity: new Prisma.Decimal('100'),
            },
            {
                productionOrderId: 'after',
                status: 'COMPLETED',
                startTime: new Date(endOfDay.getTime() + 1),
                isMaklon: true,
                quantity: new Prisma.Decimal('100'),
            },
        ];
        db.productionExecution.groupBy.mockImplementationOnce(
            async ({ where }: { where: Record<string, unknown> }) => {
                const time = where.startTime as { gte: Date; lte: Date };
                const status = where.status as { not: string };
                const relation = where.productionOrder as {
                    isMaklon: boolean;
                };
                return executions
                    .filter(
                        (execution) =>
                            execution.status !== status.not &&
                            execution.startTime >= time.gte &&
                            execution.startTime <= time.lte &&
                            execution.isMaklon === relation.isMaklon,
                    )
                    .map((execution) => ({
                        productionOrderId: execution.productionOrderId,
                        _sum: { quantityProduced: execution.quantity },
                    }));
            },
        );
        db.productionOrder.findMany.mockResolvedValueOnce([
            {
                id: 'eligible-start',
                bom: { productVariant: { primaryUnit: Unit.KG } },
            },
            {
                id: 'eligible-end',
                bom: { productVariant: { primaryUnit: Unit.KG } },
            },
        ]);

        const result = await createMaklonDashboardReader(
            db as never,
        ).readOutputTodayByUnit({ startOfDay, endOfDay });

        expect(result).toEqual({
            groups: [{ unit: Unit.KG, quantity: 4 }],
        });
        expect(db.productionOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: { in: ['eligible-start', 'eligible-end'] },
                    isMaklon: true,
                },
            }),
        );
    });

    it('groups non-VOIDED Maklon executions by order, performs one minimal unit lookup, converts Decimal values, ignores missing rows, and sorts units', async () => {
        db.productionExecution.groupBy.mockResolvedValue([
            {
                productionOrderId: 'kg-one',
                _sum: { quantityProduced: new Prisma.Decimal('1.25') },
            },
            {
                productionOrderId: 'bal-one',
                _sum: { quantityProduced: new Prisma.Decimal('2.5') },
            },
            {
                productionOrderId: 'kg-two',
                _sum: { quantityProduced: new Prisma.Decimal('3.75') },
            },
            {
                productionOrderId: 'missing-or-not-maklon',
                _sum: { quantityProduced: new Prisma.Decimal('999') },
            },
        ]);
        db.productionOrder.findMany.mockResolvedValue([
            {
                id: 'kg-one',
                bom: { productVariant: { primaryUnit: Unit.KG } },
            },
            {
                id: 'bal-one',
                bom: { productVariant: { primaryUnit: Unit.BAL } },
            },
            {
                id: 'kg-two',
                bom: { productVariant: { primaryUnit: Unit.KG } },
            },
        ]);

        const result = await createMaklonDashboardReader(
            db as never,
        ).readOutputTodayByUnit({ startOfDay, endOfDay });

        expect(result).toEqual({
            groups: [
                { unit: Unit.BAL, quantity: 2.5 },
                { unit: Unit.KG, quantity: 5 },
            ],
        });
        expect(db.productionExecution.groupBy).toHaveBeenCalledWith({
            by: ['productionOrderId'],
            where: {
                status: { not: 'VOIDED' },
                startTime: { gte: startOfDay, lte: endOfDay },
                productionOrder: { isMaklon: true },
            },
            _sum: { quantityProduced: true },
        });
        expect(db.productionOrder.findMany).toHaveBeenCalledTimes(1);
        expect(db.productionOrder.findMany).toHaveBeenCalledWith({
            where: {
                id: {
                    in: [
                        'kg-one',
                        'bal-one',
                        'kg-two',
                        'missing-or-not-maklon',
                    ],
                },
                isMaklon: true,
            },
            select: {
                id: true,
                bom: {
                    select: {
                        productVariant: {
                            select: { primaryUnit: true },
                        },
                    },
                },
            },
        });
    });

    it('keeps a single unit, valid empty output, and skips the unit lookup for no groups', async () => {
        db.productionExecution.groupBy.mockResolvedValueOnce([
            {
                productionOrderId: 'one',
                _sum: { quantityProduced: new Prisma.Decimal('7.125') },
            },
        ]);
        db.productionOrder.findMany.mockResolvedValueOnce([
            {
                id: 'one',
                bom: { productVariant: { primaryUnit: Unit.PCS } },
            },
        ]);
        const serviceReader = createMaklonDashboardReader(db as never);

        await expect(
            serviceReader.readOutputTodayByUnit({ startOfDay, endOfDay }),
        ).resolves.toEqual({
            groups: [{ unit: Unit.PCS, quantity: 7.125 }],
        });

        db.productionOrder.findMany.mockClear();
        db.productionExecution.groupBy.mockResolvedValueOnce([]);
        await expect(
            serviceReader.readOutputTodayByUnit({ startOfDay, endOfDay }),
        ).resolves.toEqual({ groups: [] });
        expect(db.productionOrder.findMany).not.toHaveBeenCalled();
    });

    it.each([
        [
            'readInProgress',
            (result: MaklonDashboardAggregate) => result.health.inProgress,
        ],
        [
            'readCompletedToday',
            (result: MaklonDashboardAggregate) => result.health.completedToday,
        ],
        [
            'readOutputTodayByUnit',
            (result: MaklonDashboardAggregate) =>
                result.health.outputTodayByUnit,
        ],
        [
            'readWaitingMaterial',
            (result: MaklonDashboardAggregate) =>
                result.attention.waitingMaterial,
        ],
        [
            'readPastPlannedEnd',
            (result: MaklonDashboardAggregate) =>
                result.attention.pastPlannedEnd,
        ],
    ] as const)(
        'marks only failed %s reader UNAVAILABLE while valid zero/empty peers survive',
        async (method, selectSection) => {
            const failing = reader({
                [method]: async () => {
                    throw new Error('reader unavailable');
                },
            });

            const result = await collectMaklonDashboard(failing, {
                snapshotAt,
            });

            expect(selectSection(result)).toEqual({
                state: 'UNAVAILABLE',
                data: null,
            });
            const allSections = [
                result.health.inProgress,
                result.health.completedToday,
                result.health.outputTodayByUnit,
                result.attention.waitingMaterial,
                result.attention.pastPlannedEnd,
            ];
            expect(
                allSections.filter(
                    (section) => section.state === 'UNAVAILABLE',
                ),
            ).toHaveLength(1);
            expect(result.drivers.state).toBe('NOT_CONFIGURED');
            expect(result.withheld.materials.state).toBe('NOT_CONFIGURED');
            expect(result.withheld.financials.state).toBe('NOT_CONFIGURED');
        },
    );

    it('returns a privacy-minimal DTO, valid available zero/empty values, and bounded all-success query topology', async () => {
        db.productionOrder.count.mockResolvedValue(0);
        db.productionExecution.groupBy.mockResolvedValue([]);

        const result = await readMaklonDashboard(db as never, { snapshotAt });
        const serialized = JSON.stringify(result);

        expect(result.health.inProgress).toEqual({
            state: 'AVAILABLE',
            data: { count: 0 },
        });
        expect(result.health.outputTodayByUnit).toEqual({
            state: 'AVAILABLE',
            data: { groups: [] },
        });
        expect(db.productionOrder.count).toHaveBeenCalledTimes(4);
        expect(db.productionExecution.groupBy).toHaveBeenCalledTimes(1);
        expect(db.productionOrder.findMany).not.toHaveBeenCalled();

        for (const forbidden of [
            'customerId',
            'customerName',
            'orderNumber',
            'salesOrderId',
            'receiptNumber',
            'returnNumber',
            'invoice',
            'price',
            'cost',
            'revenue',
            'margin',
        ]) {
            expect(serialized.toLowerCase()).not.toContain(
                forbidden.toLowerCase(),
            );
        }

        const queryProjection = JSON.stringify([
            ...db.productionExecution.groupBy.mock.calls,
            ...db.productionOrder.findMany.mock.calls,
        ]).toLowerCase();
        for (const forbidden of [
            'customer',
            'salesorder',
            'ordernumber',
            'invoice',
            'cost',
            'price',
            'amount',
        ]) {
            expect(queryProjection).not.toContain(forbidden);
        }
    });
});
