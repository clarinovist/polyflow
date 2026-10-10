import { ProductionStatus, type PrismaClient, type Unit } from '@prisma/client';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

export type MaklonDashboardSection<T> =
    | { state: 'AVAILABLE'; data: T }
    | { state: 'UNAVAILABLE'; data: null };

export type MaklonDashboardNotConfigured = {
    state: 'NOT_CONFIGURED';
    data: null;
};

export interface MaklonDashboardAggregate {
    generatedAt: string;
    snapshotAt: string;
    workDate: string;
    health: {
        inProgress: MaklonDashboardSection<{ count: number }>;
        completedToday: MaklonDashboardSection<{ count: number }>;
        outputTodayByUnit: MaklonDashboardSection<{
            groups: Array<{ unit: Unit; quantity: number }>;
        }>;
    };
    attention: {
        waitingMaterial: MaklonDashboardSection<{ count: number }>;
        pastPlannedEnd: MaklonDashboardSection<{ count: number }>;
    };
    drivers: MaklonDashboardNotConfigured;
    withheld: {
        materials: MaklonDashboardNotConfigured;
        financials: MaklonDashboardNotConfigured;
    };
}

export interface MaklonDashboardReader {
    readInProgress(): Promise<{ count: number }>;
    readCompletedToday(bounds: {
        startOfDay: Date;
        endOfDay: Date;
    }): Promise<{ count: number }>;
    readOutputTodayByUnit(bounds: {
        startOfDay: Date;
        endOfDay: Date;
    }): Promise<{ groups: Array<{ unit: Unit; quantity: number }> }>;
    readWaitingMaterial(): Promise<{ count: number }>;
    readPastPlannedEnd(snapshotAt: Date): Promise<{ count: number }>;
}

function available<T>(data: T): MaklonDashboardSection<T> {
    return { state: 'AVAILABLE', data };
}

function unavailable<T>(): MaklonDashboardSection<T> {
    return { state: 'UNAVAILABLE', data: null };
}

function notConfigured(): MaklonDashboardNotConfigured {
    return { state: 'NOT_CONFIGURED', data: null };
}

function settledSection<T>(
    result: PromiseSettledResult<T>,
): MaklonDashboardSection<T> {
    return result.status === 'fulfilled'
        ? available(result.value)
        : unavailable();
}

function sortUnits(left: { unit: Unit }, right: { unit: Unit }): number {
    if (left.unit < right.unit) return -1;
    if (left.unit > right.unit) return 1;
    return 0;
}

export function createMaklonDashboardReader(
    db: PrismaClient,
): MaklonDashboardReader {
    return {
        async readInProgress() {
            return {
                count: await db.productionOrder.count({
                    where: {
                        isMaklon: true,
                        status: ProductionStatus.IN_PROGRESS,
                    },
                }),
            };
        },
        async readCompletedToday({ startOfDay, endOfDay }) {
            return {
                count: await db.productionOrder.count({
                    where: {
                        isMaklon: true,
                        status: ProductionStatus.COMPLETED,
                        actualEndDate: {
                            gte: startOfDay,
                            lte: endOfDay,
                        },
                    },
                }),
            };
        },
        async readOutputTodayByUnit({ startOfDay, endOfDay }) {
            const outputByOrder = await db.productionExecution.groupBy({
                by: ['productionOrderId'],
                where: {
                    status: { not: 'VOIDED' },
                    startTime: { gte: startOfDay, lte: endOfDay },
                    productionOrder: { isMaklon: true },
                },
                _sum: { quantityProduced: true },
            });

            if (outputByOrder.length === 0) return { groups: [] };

            const orderIds = outputByOrder.map(
                (group) => group.productionOrderId,
            );
            const orders = await db.productionOrder.findMany({
                where: { id: { in: orderIds }, isMaklon: true },
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
            const unitsByOrder = new Map(
                orders.map((order) => [
                    order.id,
                    order.bom.productVariant.primaryUnit,
                ]),
            );
            const totals = new Map<Unit, number>();

            for (const group of outputByOrder) {
                const unit = unitsByOrder.get(group.productionOrderId);
                if (!unit) continue;
                const quantity = Number(group._sum.quantityProduced ?? 0);
                totals.set(unit, (totals.get(unit) ?? 0) + quantity);
            }

            return {
                groups: [...totals.entries()]
                    .map(([unit, quantity]) => ({ unit, quantity }))
                    .sort(sortUnits),
            };
        },
        async readWaitingMaterial() {
            return {
                count: await db.productionOrder.count({
                    where: {
                        isMaklon: true,
                        status: ProductionStatus.WAITING_MATERIAL,
                    },
                }),
            };
        },
        async readPastPlannedEnd(snapshotAt) {
            return {
                count: await db.productionOrder.count({
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
                }),
            };
        },
    };
}

export async function collectMaklonDashboard(
    reader: MaklonDashboardReader,
    options: { snapshotAt?: Date } = {},
): Promise<MaklonDashboardAggregate> {
    const snapshotAt = options.snapshotAt ?? new Date();
    const snapshotIso = snapshotAt.toISOString();
    const workDate = toBusinessDateString(snapshotAt);
    const bounds = getWibDayBounds(workDate);

    const [
        inProgress,
        completedToday,
        outputTodayByUnit,
        waitingMaterial,
        pastPlannedEnd,
    ] = await Promise.allSettled([
        reader.readInProgress(),
        reader.readCompletedToday(bounds),
        reader.readOutputTodayByUnit(bounds),
        reader.readWaitingMaterial(),
        reader.readPastPlannedEnd(snapshotAt),
    ]);

    return {
        generatedAt: snapshotIso,
        snapshotAt: snapshotIso,
        workDate,
        health: {
            inProgress: settledSection(inProgress),
            completedToday: settledSection(completedToday),
            outputTodayByUnit: settledSection(outputTodayByUnit),
        },
        attention: {
            waitingMaterial: settledSection(waitingMaterial),
            pastPlannedEnd: settledSection(pastPlannedEnd),
        },
        drivers: notConfigured(),
        withheld: {
            materials: notConfigured(),
            financials: notConfigured(),
        },
    };
}

export async function readMaklonDashboard(
    db: PrismaClient,
    options: { snapshotAt?: Date } = {},
): Promise<MaklonDashboardAggregate> {
    return collectMaklonDashboard(createMaklonDashboardReader(db), options);
}
