'use server';

import { prisma } from '@/lib/prisma';
import {
    DateRange,
    ProductionRealizationItem,
    MaterialUsageVarianceItem,
    MachinePerformanceItem,
    OperatorProductivityItem,
    QualityControlSummary,
} from '@/types/analytics';
import { Prisma } from '@prisma/client';

/**
 * Helper to calculate percentage safely
 */
function safePercentage(numerator: number, denominator: number): number {
    if (denominator === 0) return 0;
    return (numerator / denominator) * 100;
}

/**
 * 1. Production Realization Report
 * - Yield Rate: (actualQuantity / plannedQuantity) * 100
 * - Schedule Adherence
 */
export async function getProductionRealizationReport(
    dateRange: DateRange
): Promise<ProductionRealizationItem[]> {
    const orders = await prisma.productionOrder.findMany({
        where: {
            plannedStartDate: {
                gte: dateRange.from,
                lte: dateRange.to,
            },
        },
        include: {
            bom: true, // to get product name sometimes, generally it's in BOM or we need productVariant
        },
        orderBy: {
            plannedStartDate: 'asc',
        },
    });

    // To get Product Name, we might need to fetch BOM -> ProductVariant -> Product or Name
    // Schema: ProductionOrder -> Bom -> ProductVariant -> name
    // Or fetch relations separately. Let's optimize if needed.
    // Actually schema: ProductionOrder -> Bom -> ProductVariant
    // Let's perform a deeper include or just accept what we have.
    // The schema for ProductionOrder has bomId.
    // Let's refetch with relations or change include.
    const ordersWithDetails = await prisma.productionOrder.findMany({
        where: {
            plannedStartDate: {
                gte: dateRange.from,
                lte: dateRange.to,
            },
        },
        include: {
            bom: {
                include: {
                    productVariant: true,
                },
            },
        },
        orderBy: {
            plannedStartDate: 'asc',
        },
    });

    return ordersWithDetails.map((order) => {
        const plannedQty = Number(order.plannedQuantity);
        const actualQty = order.actualQuantity ? Number(order.actualQuantity) : 0;
        const yieldRate = safePercentage(actualQty, plannedQty);

        let scheduleAdherence: 'On Time' | 'Late' | 'Early' | 'Pending' = 'Pending';
        let delayDays = 0;

        if (order.status === 'COMPLETED' && order.actualEndDate && order.plannedEndDate) {
            if (order.actualEndDate <= order.plannedEndDate) {
                scheduleAdherence = 'On Time';
                // Check for early?
                // If actual end is significantly before planned end
                const diffTime = order.plannedEndDate.getTime() - order.actualEndDate.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays > 0) {
                    // Early
                    scheduleAdherence = 'Early'; // Or treat as On Time
                }
            } else {
                scheduleAdherence = 'Late';
                const diffTime = order.actualEndDate.getTime() - order.plannedEndDate.getTime();
                delayDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
        } else if (order.status === 'COMPLETED' && !order.plannedEndDate) {
            scheduleAdherence = 'On Time'; // No deadline
        }

        return {
            orderNumber: order.orderNumber,
            productName: order.bom.productVariant.name,
            plannedQuantity: plannedQty,
            actualQuantity: actualQty,
            yieldRate,
            plannedEndDate: order.plannedEndDate,
            actualEndDate: order.actualEndDate,
            status: order.status,
            scheduleAdherence,
            delayDays,
        };
    });
}

/**
 * 2. Material Usage Variance Report
 * - Compare "Standard" (ProductionMaterial) vs "Actual" (MaterialIssue)
 */
export async function getMaterialUsageVarianceReport(
    dateRange: DateRange
): Promise<MaterialUsageVarianceItem[]> {
    // Fetch orders in range
    const orders = await prisma.productionOrder.findMany({
        where: {
            plannedStartDate: {
                gte: dateRange.from,
                lte: dateRange.to,
            },
            // Only consider orders that have started or have issues
        },
        include: {
            bom: {
                include: {
                    productVariant: true,
                },
            },
            plannedMaterials: {
                include: {
                    productVariant: true,
                },
            },
            materialIssues: {
                include: {
                    productVariant: true,
                },
            },
        },
    });

    const report: MaterialUsageVarianceItem[] = [];

    for (const order of orders) {
        // Group by productVariantId
        const distinctVariantIds = new Set([
            ...order.plannedMaterials.map((m) => m.productVariantId),
            ...order.materialIssues.map((m) => m.productVariantId),
        ]);

        for (const variantId of distinctVariantIds) {
            const planned = order.plannedMaterials.find((m) => m.productVariantId === variantId);
            const issues = order.materialIssues.filter((m) => m.productVariantId === variantId);

            const totalIssued = issues.reduce((sum, item) => sum + Number(item.quantity), 0);
            const totalPlanned = planned ? Number(planned.quantity) : 0;

            // Identify material details
            let materialName = 'Unknown';
            let materialSku = 'Unknown';

            if (planned) {
                materialName = planned.productVariant.name;
                materialSku = planned.productVariant.skuCode;
            } else if (issues.length > 0) {
                materialName = issues[0].productVariant.name;
                materialSku = issues[0].productVariant.skuCode;
            }

            const variance = totalIssued - totalPlanned;
            const variancePercentage = safePercentage(variance, totalPlanned);

            report.push({
                orderNumber: order.orderNumber,
                materialName,
                materialSku,
                standardQuantity: totalPlanned,
                actualQuantity: totalIssued,
                variance,
                variancePercentage,
            });
        }
    }

    return report;
}

/**
 * 3. Machine Performance Report
 * - Aggregate ProductionExecution
 */
export async function getMachinePerformanceReport(
    dateRange: DateRange
): Promise<MachinePerformanceItem[]> {
    const executions = await prisma.productionExecution.findMany({
        where: {
            startTime: {
                gte: dateRange.from,
                lte: dateRange.to,
            },
            machineId: {
                not: null,
            },
        },
        include: {
            machine: true,
        },
    });

    // Group by Machine
    const machineMap = new Map<string, {
        machineName: string;
        machineCode: string;
        totalOutput: number;
        totalHours: number;
        totalScrap: number;
    }>();

    for (const exec of executions) {
        if (!exec.machineId || !exec.machine) continue;

        const current = machineMap.get(exec.machineId) || {
            machineName: exec.machine.name,
            machineCode: exec.machine.code,
            totalOutput: 0,
            totalHours: 0,
            totalScrap: 0,
        };

        const output = Number(exec.quantityProduced);
        const scrap = Number(exec.scrapQuantity);

        // Calculate duration in hours
        const durationMs = exec.endTime.getTime() - exec.startTime.getTime();
        const durationHours = durationMs / (1000 * 60 * 60);

        current.totalOutput += output;
        current.totalScrap += scrap;
        current.totalHours += durationHours;

        machineMap.set(exec.machineId, current);
    }

    const report: MachinePerformanceItem[] = [];

    for (const data of machineMap.values()) {
        const unitsPerHour = data.totalHours > 0 ? data.totalOutput / data.totalHours : 0;
        // Scrap Rate = (Scrap / (Good + Scrap)) * 100 ? Or just Scrap / Output?
        // Usually Scrap Rate is Scrap / Total Produced(Good + Scrap).
        const totalMaterialProcessed = data.totalOutput + data.totalScrap;
        const scrapRate = safePercentage(data.totalScrap, totalMaterialProcessed);

        report.push({
            machineName: data.machineName,
            machineCode: data.machineCode,
            totalOutput: data.totalOutput,
            totalOperatingHours: Number(data.totalHours.toFixed(2)),
            unitsPerHour: Number(unitsPerHour.toFixed(2)),
            scrapRate: Number(scrapRate.toFixed(2)),
        });
    }

    return report;
}

/**
 * 4. Operator Productivity Leaderboard
 * - Group by operatorId
 */
export async function getOperatorProductivityLeaderboard(
    dateRange: DateRange
): Promise<OperatorProductivityItem[]> {
    // We need to group by Operator AND ProductionOrder to count unique orders efficiently
    // However, fetching raw data and processing is cleaner for unique counts unless dataset is huge.
    // Let's use groupBy first if possible.
    // Prisma groupBy doesn't count distinct fields easily.
    // So we fetch with distinct? No.
    // Let's query all relevant executions.

    const executions = await prisma.productionExecution.findMany({
        where: {
            endTime: {
                gte: dateRange.from,
                lte: dateRange.to,
            },
            operatorId: {
                not: null,
            },
        },
        include: {
            operator: true,
        },
    });

    const operatorMap = new Map<string, {
        name: string;
        code: string;
        totalOutput: number;
        totalScrap: number;
        orderIds: Set<string>;
    }>();

    for (const exec of executions) {
        if (!exec.operatorId || !exec.operator) continue;

        const current = operatorMap.get(exec.operatorId) || {
            name: exec.operator.name,
            code: exec.operator.code,
            totalOutput: 0,
            totalScrap: 0,
            orderIds: new Set<string>(),
        };

        current.totalOutput += Number(exec.quantityProduced);
        current.totalScrap += Number(exec.scrapQuantity);
        current.orderIds.add(exec.productionOrderId);

        operatorMap.set(exec.operatorId, current);
    }

    const leaderboard: OperatorProductivityItem[] = [];

    for (const data of operatorMap.values()) {
        const totalProcessed = data.totalOutput + data.totalScrap;
        const scrapRate = safePercentage(data.totalScrap, totalProcessed);

        leaderboard.push({
            operatorName: data.name,
            operatorCode: data.code,
            totalQuantityProduced: data.totalOutput,
            totalScrapQuantity: data.totalScrap,
            ordersHandled: data.orderIds.size,
            scrapRate: Number(scrapRate.toFixed(2)),
        });
    }

    // Sort by highest output
    leaderboard.sort((a, b) => b.totalQuantityProduced - a.totalQuantityProduced);

    return leaderboard;
}

/**
 * 5. Quality Control Summary
 * - Pass/Fail/Quarantine
 * - Scrap reasons
 */
export async function getQualityControlSummary(
    dateRange: DateRange
): Promise<QualityControlSummary> {
    const [inspectionGroups, scrapGroups] = await Promise.all([
        prisma.qualityInspection.groupBy({
            by: ['result'],
            where: {
                inspectedAt: {
                    gte: dateRange.from,
                    lte: dateRange.to,
                },
            },
            _count: {
                id: true,
            },
        }),
        prisma.scrapRecord.groupBy({
            by: ['reason'],
            where: {
                recordedAt: {
                    gte: dateRange.from,
                    lte: dateRange.to,
                },
            },
            _sum: {
                quantity: true,
            },
        }),
    ]);

    const stats = {
        total: 0,
        pass: 0,
        fail: 0,
        quarantine: 0,
    };

    for (const group of inspectionGroups) {
        const count = group._count.id;
        stats.total += count;
        if (group.result === 'PASS') stats.pass += count;
        if (group.result === 'FAIL') stats.fail += count;
        if (group.result === 'QUARANTINE') stats.quarantine += count;
    }

    const passRate = safePercentage(stats.pass, stats.total);

    // Scrap Reasons
    const totalScrapQty = scrapGroups.reduce((sum, g) => sum + (Number(g._sum.quantity) || 0), 0);

    const scrapByReason = scrapGroups.map((g) => {
        const qty = Number(g._sum.quantity) || 0;
        return {
            reason: g.reason || 'Unspecified',
            quantity: qty,
            percentage: Number(safePercentage(qty, totalScrapQty).toFixed(2)),
        };
    }).sort((a, b) => b.quantity - a.quantity);

    return {
        inspections: {
            ...stats,
            passRate: Number(passRate.toFixed(2)),
        },
        scrapByReason,
    };
}
