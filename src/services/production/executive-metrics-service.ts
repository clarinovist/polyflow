import { prisma } from '@/lib/core/prisma';
import { ProductionStatus } from '@prisma/client';
import { getWibMonthBounds, toBusinessDateString } from '@/lib/utils/timezone';

export type ExecutiveProductionMetrics = {
    activeJobs: number;
    delayedJobs: number;
    completionRate: number;
    downtimeHours: number;
    runningMachines: number;
    totalMachines: number;
    trend?: number;
    totalScrap: null;
    scrapStatus: 'NOT_CONFIGURED';
};

function completionRate(rows: Array<{ status: ProductionStatus }>) {
    if (rows.length === 0) return 0;
    return (
        (rows.filter((row) => row.status === ProductionStatus.COMPLETED)
            .length /
            rows.length) *
        100
    );
}

function previousMonth(year: number, month: number) {
    return month === 1
        ? { year: year - 1, month: 12 }
        : { year, month: month - 1 };
}

export async function getExecutiveProductionMetrics(
    now: Date = new Date(),
): Promise<ExecutiveProductionMetrics> {
    const [year, month] = toBusinessDateString(now).split('-').map(Number);
    const currentBounds = getWibMonthBounds(year, month);
    const previous = previousMonth(year, month);
    const previousBounds = getWibMonthBounds(previous.year, previous.month);

    const [
        activeJobs,
        currentOrders,
        delayedJobs,
        totalMachines,
        runningMachineOrders,
        downtimeRecords,
        previousOrders,
    ] = await Promise.all([
        prisma.productionOrder.count({
            where: {
                status: {
                    in: [
                        ProductionStatus.RELEASED,
                        ProductionStatus.IN_PROGRESS,
                    ],
                },
            },
        }),
        prisma.productionOrder.findMany({
            where: {
                createdAt: { gte: currentBounds.start, lte: currentBounds.end },
            },
            select: { status: true },
        }),
        prisma.productionOrder.count({
            where: {
                status: {
                    in: [
                        ProductionStatus.RELEASED,
                        ProductionStatus.IN_PROGRESS,
                    ],
                },
                plannedEndDate: { lt: now },
            },
        }),
        prisma.machine.count({ where: { status: 'ACTIVE' } }),
        prisma.productionOrder.findMany({
            where: {
                status: ProductionStatus.IN_PROGRESS,
                machineId: { not: null },
            },
            select: { machineId: true },
            distinct: ['machineId'],
        }),
        prisma.machineDowntime.findMany({
            where: {
                startTime: { gte: currentBounds.start, lte: currentBounds.end },
            },
            select: { startTime: true, endTime: true },
        }),
        prisma.productionOrder.findMany({
            where: {
                createdAt: {
                    gte: previousBounds.start,
                    lte: previousBounds.end,
                },
            },
            select: { status: true },
        }),
    ]);

    const currentCompletion = completionRate(currentOrders);
    const previousCompletion = completionRate(previousOrders);
    const downtimeMs = downtimeRecords.reduce(
        (sum, row) =>
            sum +
            ((row.endTime?.getTime() ?? now.getTime()) -
                row.startTime.getTime()),
        0,
    );

    return {
        activeJobs,
        delayedJobs,
        completionRate: currentCompletion,
        downtimeHours: downtimeMs / (1000 * 60 * 60),
        runningMachines: runningMachineOrders.length,
        totalMachines,
        trend:
            previousCompletion > 0
                ? ((currentCompletion - previousCompletion) /
                      previousCompletion) *
                  100
                : undefined,
        totalScrap: null,
        scrapStatus: 'NOT_CONFIGURED',
    };
}
