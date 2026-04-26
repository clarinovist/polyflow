import { prisma } from '@/lib/core/prisma';

export interface HppBenchmark {
    bomId: string;
    avgLaborPerUnit: number;
    avgMachinePerUnit: number;
    orderCount: number;
}

interface BenchmarkAccumulator {
    totalLabor: number;
    totalMachine: number;
    totalQuantity: number;
    orderCount: number;
}

/**
 * Calculate average labor and machine cost per unit for a BOM
 * based on completed production orders within the given window.
 * Excludes VOIDED orders and maklon orders.
 * Falls back to 0 if no qualifying data exists.
 */
export async function getHppBenchmarkByBomId(
    bomId: string,
    windowDays = 90
): Promise<HppBenchmark> {
    const since = new Date();
    since.setDate(since.getDate() - windowDays);

    const orders = await prisma.productionOrder.findMany({
        where: {
            bomId,
            status: 'COMPLETED',
            isMaklon: false,
            actualEndDate: { gte: since },
        },
        select: {
            id: true,
            actualQuantity: true,
            executions: {
                where: { status: { not: 'VOIDED' } },
                select: {
                    startTime: true,
                    endTime: true,
                    machine: {
                        select: { costPerHour: true },
                    },
                    operator: {
                        select: { hourlyRate: true },
                    },
                },
            },
        },
    });

    const acc: BenchmarkAccumulator = { totalLabor: 0, totalMachine: 0, totalQuantity: 0, orderCount: 0 };

    for (const order of orders) {
        const quantity = Number(order.actualQuantity ?? 0);
        if (quantity <= 0) continue;

        let orderLabor = 0;
        let orderMachine = 0;

        for (const exec of order.executions) {
            const endTime = exec.endTime ? new Date(exec.endTime) : new Date();
            const startTime = new Date(exec.startTime);
            const durationMs = endTime.getTime() - startTime.getTime();
            const durationHours = durationMs > 0 ? durationMs / (1000 * 60 * 60) : 0;

            if (exec.machine) {
                orderMachine += durationHours * Number(exec.machine.costPerHour ?? 0);
            }
            if (exec.operator) {
                orderLabor += durationHours * Number(exec.operator.hourlyRate ?? 0);
            }
        }

        acc.totalLabor += orderLabor;
        acc.totalMachine += orderMachine;
        acc.totalQuantity += quantity;
        acc.orderCount += 1;
    }

    if (acc.totalQuantity <= 0) {
        return { bomId, avgLaborPerUnit: 0, avgMachinePerUnit: 0, orderCount: 0 };
    }

    return {
        bomId,
        avgLaborPerUnit: acc.totalLabor / acc.totalQuantity,
        avgMachinePerUnit: acc.totalMachine / acc.totalQuantity,
        orderCount: acc.orderCount,
    };
}

/**
 * Fetch benchmarks for multiple BOMs in parallel.
 */
export async function getHppBenchmarks(
    bomIds: string[],
    windowDays = 90
): Promise<Map<string, HppBenchmark>> {
    const results = await Promise.all(
        bomIds.map((id) => getHppBenchmarkByBomId(id, windowDays))
    );

    const benchmarkMap = new Map<string, HppBenchmark>();
    for (const benchmark of results) {
        benchmarkMap.set(benchmark.bomId, benchmark);
    }
    return benchmarkMap;
}
