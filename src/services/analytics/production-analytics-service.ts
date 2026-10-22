import { prisma } from '@/lib/core/prisma';
import { executionScrapTotal } from '@/lib/production/execution-scrap';
import { resolveAnalyticsPeriod } from '@/lib/production/analytics-period';
import {
    PROCESS_KEYS,
    processKeyFromCategory,
    type ProcessKey,
} from '@/lib/production/process-keys';
import {
    DateRange,
    MachinePerformanceItem,
    OperatorProductivityItem,
    ProductionRealizationItem,
    QualityControlSummary,
} from '@/types/analytics';

/** Output and affal of one process; units follow that process, never summed across processes. */
export interface ProcessAffalTotals {
    produced: number;
    affal: number;
    entries: number;
}

export interface ProductionAnalyticsData {
    realization: ProductionRealizationItem[];
    /** From non-voided execution entries, same source and WIB days as Produksi Harian. */
    affalByProcess: Record<ProcessKey, ProcessAffalTotals>;
    quality: QualityControlSummary;
    machinePerformance: MachinePerformanceItem[];
    operatorProductivity: OperatorProductivityItem[];
}

export async function getProductionAnalytics(
    dateRange?: DateRange,
): Promise<ProductionAnalyticsData> {
    // WIB business days, like Produksi Harian: never the server timezone.
    const { start: startDate, end: endDate } =
        resolveAnalyticsPeriod(dateRange);

    const productionOrders = await prisma.productionOrder.findMany({
        where: {
            OR: [
                { actualEndDate: { gte: startDate, lte: endDate } },
                {
                    updatedAt: { gte: startDate, lte: endDate },
                    status: { in: ['COMPLETED', 'IN_PROGRESS'] },
                },
            ],
        },
        include: {
            bom: {
                include: {
                    productVariant: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    const realization: ProductionRealizationItem[] = productionOrders.map(
        (order) => {
            const plannedQty = Number(order.plannedQuantity);
            const actualQty = Number(order.actualQuantity || 0);
            const yieldRate =
                plannedQty > 0 ? (actualQty / plannedQty) * 100 : 0;

            let scheduleAdherence: 'On Time' | 'Late' | 'Early' | 'Pending' =
                'Pending';
            let delayDays = 0;

            if (order.actualEndDate && order.plannedEndDate) {
                const diffTime =
                    new Date(order.actualEndDate).getTime() -
                    new Date(order.plannedEndDate).getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                delayDays = diffDays;

                if (diffDays > 0) scheduleAdherence = 'Late';
                else if (diffDays < 0) scheduleAdherence = 'Early';
                else scheduleAdherence = 'On Time';
            }

            return {
                orderId: order.id,
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
        },
    );

    const scrapRecords = await prisma.scrapRecord.findMany({
        where: {
            recordedAt: { gte: startDate, lte: endDate },
            // Affal of a voided entry no longer counts.
            OR: [
                { productionExecutionId: null },
                { productionExecution: { status: { not: 'VOIDED' } } },
            ],
        },
    });

    const scrapByReasonMap: Record<string, number> = {};
    let totalScrap = 0;

    scrapRecords.forEach((record) => {
        const reason = record.reason || 'Unspecified';
        const qty = Number(record.quantity);
        scrapByReasonMap[reason] = (scrapByReasonMap[reason] || 0) + qty;
        totalScrap += qty;
    });

    const scrapByReason = Object.entries(scrapByReasonMap)
        .map(([reason, quantity]) => ({
            reason,
            quantity,
            percentage: totalScrap > 0 ? (quantity / totalScrap) * 100 : 0,
        }))
        .sort((a, b) => b.quantity - a.quantity);

    const variantIds = [
        ...new Set(scrapRecords.map((record) => record.productVariantId)),
    ];
    const variants = await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, name: true, product: { select: { name: true } } },
    });
    const variantNameMap = new Map(
        variants.map((variant) => [
            variant.id,
            `${variant.product.name} - ${variant.name}`,
        ]),
    );

    const scrapByProductMap: Record<
        string,
        { name: string; qty: number; sampleOrderId?: string }
    > = {};
    for (const record of scrapRecords) {
        const name =
            variantNameMap.get(record.productVariantId) || 'Unknown Product';
        const qty = Number(record.quantity);
        const existing = scrapByProductMap[record.productVariantId];
        if (existing) {
            existing.qty += qty;
            if (!existing.sampleOrderId)
                existing.sampleOrderId = record.productionOrderId;
        } else {
            scrapByProductMap[record.productVariantId] = {
                name,
                qty,
                sampleOrderId: record.productionOrderId,
            };
        }
    }

    const scrapByProduct = Object.entries(scrapByProductMap)
        .map(([variantId, v]) => ({
            productVariantId: variantId,
            productName: v.name,
            quantity: v.qty,
            percentage: totalScrap > 0 ? (v.qty / totalScrap) * 100 : 0,
            sampleProductionOrderId: v.sampleOrderId,
        }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 8);

    const inspections = await prisma.qualityInspection.findMany({
        where: {
            inspectedAt: { gte: startDate, lte: endDate },
        },
    });

    const inspectionStats = inspections.reduce(
        (acc, curr) => {
            acc.total++;
            if (curr.result === 'PASS') acc.pass++;
            else if (curr.result === 'FAIL') acc.fail++;
            else if (curr.result === 'QUARANTINE') acc.quarantine++;
            return acc;
        },
        { total: 0, pass: 0, fail: 0, quarantine: 0 },
    );

    const quality: QualityControlSummary = {
        inspections: {
            ...inspectionStats,
            passRate:
                inspectionStats.total > 0
                    ? (inspectionStats.pass / inspectionStats.total) * 100
                    : 0,
        },
        scrapByReason,
        scrapByProduct,
    };

    const executions = await prisma.productionExecution.findMany({
        where: {
            // Voided entries are cancelled output: excluded, as in Produksi Harian.
            status: { not: 'VOIDED' },
            startTime: { gte: startDate, lte: endDate },
        },
        include: {
            machine: true,
            operator: true,
            productionOrder: {
                select: { bom: { select: { category: true } } },
            },
        },
    });

    const machineMap: Record<
        string,
        {
            machineId: string;
            machineName: string;
            totalOutput: number;
            operatingHours: number;
            scrap: number;
        }
    > = {};
    const operatorMap: Record<
        string,
        {
            process: ProcessKey;
            name: string;
            code: string;
            output: number;
            scrap: number;
            orders: Set<string>;
        }
    > = {};

    const affalByProcess = Object.fromEntries(
        PROCESS_KEYS.map((key) => [key, { produced: 0, affal: 0, entries: 0 }]),
    ) as Record<ProcessKey, ProcessAffalTotals>;

    executions.forEach((execution) => {
        const quantity = Number(execution.quantityProduced);
        const scrap = executionScrapTotal(execution);
        const process = processKeyFromCategory(
            execution.productionOrder?.bom?.category,
        );
        affalByProcess[process].produced += quantity;
        affalByProcess[process].affal += scrap;
        affalByProcess[process].entries += 1;

        let durationHours = 0;
        if (execution.endTime && execution.startTime) {
            durationHours =
                (new Date(execution.endTime).getTime() -
                    new Date(execution.startTime).getTime()) /
                (1000 * 60 * 60);
        }

        if (execution.machine) {
            const machineCode = execution.machine.code;
            if (!machineMap[machineCode]) {
                machineMap[machineCode] = {
                    machineId: execution.machine.id,
                    machineName: execution.machine.name,
                    totalOutput: 0,
                    operatingHours: 0,
                    scrap: 0,
                };
            }
            machineMap[machineCode].totalOutput += quantity;
            machineMap[machineCode].scrap += scrap;
            machineMap[machineCode].operatingHours += durationHours;
        }

        if (execution.operator) {
            const operatorCode = execution.operator.code;
            // Per process: output units differ, so one operator is never summed across processes.
            const operatorKey = `${process}:${operatorCode}`;
            if (!operatorMap[operatorKey]) {
                operatorMap[operatorKey] = {
                    process,
                    name: execution.operator.name,
                    code: operatorCode,
                    output: 0,
                    scrap: 0,
                    orders: new Set(),
                };
            }
            operatorMap[operatorKey].output += quantity;
            operatorMap[operatorKey].scrap += scrap;
            operatorMap[operatorKey].orders.add(execution.productionOrderId);
        }
    });

    const machinePerformance: MachinePerformanceItem[] = Object.entries(
        machineMap,
    ).map(([code, data]) => ({
        machineId: data.machineId,
        machineCode: code,
        machineName: data.machineName,
        totalOutput: data.totalOutput,
        totalOperatingHours: data.operatingHours,
        unitsPerHour:
            data.operatingHours > 0
                ? data.totalOutput / data.operatingHours
                : 0,
        scrapRate:
            data.totalOutput + data.scrap > 0
                ? (data.scrap / (data.totalOutput + data.scrap)) * 100
                : 0,
    }));

    const operatorProductivity: OperatorProductivityItem[] = Object.values(
        operatorMap,
    ).map((data) => ({
        process: data.process,
        operatorName: data.name,
        operatorCode: data.code,
        totalQuantityProduced: data.output,
        totalScrapQuantity: data.scrap,
        ordersHandled: data.orders.size,
        scrapRate:
            data.output + data.scrap > 0
                ? (data.scrap / (data.output + data.scrap)) * 100
                : 0,
    }));

    return {
        realization,
        affalByProcess,
        quality,
        machinePerformance,
        operatorProductivity,
    };
}
