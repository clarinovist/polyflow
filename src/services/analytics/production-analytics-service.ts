import { endOfDay, startOfMonth } from 'date-fns';

import { prisma } from '@/lib/core/prisma';
import {
    DateRange,
    MachinePerformanceItem,
    OperatorProductivityItem,
    ProductionRealizationItem,
    QualityControlSummary
} from '@/types/analytics';

export interface ProductionAnalyticsData {
    realization: ProductionRealizationItem[];
    quality: QualityControlSummary;
    machinePerformance: MachinePerformanceItem[];
    operatorProductivity: OperatorProductivityItem[];
}

export async function getProductionAnalytics(dateRange?: DateRange): Promise<ProductionAnalyticsData> {
    const now = new Date();
    const endDate = dateRange?.to || endOfDay(now);
    const startDate = dateRange?.from || startOfMonth(now);

    const productionOrders = await prisma.productionOrder.findMany({
        where: {
            OR: [
                { actualEndDate: { gte: startDate, lte: endDate } },
                { updatedAt: { gte: startDate, lte: endDate }, status: { in: ['COMPLETED', 'IN_PROGRESS'] } }
            ]
        },
        include: {
            bom: {
                include: {
                    productVariant: true
                }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    const realization: ProductionRealizationItem[] = productionOrders.map(order => {
        const plannedQty = Number(order.plannedQuantity);
        const actualQty = Number(order.actualQuantity || 0);
        const yieldRate = plannedQty > 0 ? (actualQty / plannedQty) * 100 : 0;

        let scheduleAdherence: 'On Time' | 'Late' | 'Early' | 'Pending' = 'Pending';
        let delayDays = 0;

        if (order.actualEndDate && order.plannedEndDate) {
            const diffTime = new Date(order.actualEndDate).getTime() - new Date(order.plannedEndDate).getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            delayDays = diffDays;

            if (diffDays > 0) scheduleAdherence = 'Late';
            else if (diffDays < 0) scheduleAdherence = 'Early';
            else scheduleAdherence = 'On Time';
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
            delayDays
        };
    });

    const scrapRecords = await prisma.scrapRecord.findMany({
        where: {
            recordedAt: { gte: startDate, lte: endDate }
        }
    });

    const scrapByReasonMap: Record<string, number> = {};
    let totalScrap = 0;

    scrapRecords.forEach(record => {
        const reason = record.reason || 'Unspecified';
        const qty = Number(record.quantity);
        scrapByReasonMap[reason] = (scrapByReasonMap[reason] || 0) + qty;
        totalScrap += qty;
    });

    const scrapByReason = Object.entries(scrapByReasonMap)
        .map(([reason, quantity]) => ({
            reason,
            quantity,
            percentage: totalScrap > 0 ? (quantity / totalScrap) * 100 : 0
        }))
        .sort((a, b) => b.quantity - a.quantity);

    const scrapByProductMap: Record<string, number> = {};
    const variantIds = [...new Set(scrapRecords.map(record => record.productVariantId))];
    const variants = await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, name: true, product: { select: { name: true } } }
    });
    const variantNameMap = new Map(variants.map(variant => [variant.id, `${variant.product.name} - ${variant.name}`]));

    scrapRecords.forEach(record => {
        const variantId = record.productVariantId;
        const name = variantNameMap.get(variantId) || 'Unknown Product';
        const qty = Number(record.quantity);
        scrapByProductMap[name] = (scrapByProductMap[name] || 0) + qty;
    });

    const scrapByProduct = Object.entries(scrapByProductMap)
        .map(([productName, quantity]) => ({
            productName,
            quantity,
            percentage: totalScrap > 0 ? (quantity / totalScrap) * 100 : 0
        }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

    const inspections = await prisma.qualityInspection.findMany({
        where: {
            inspectedAt: { gte: startDate, lte: endDate }
        }
    });

    const inspectionStats = inspections.reduce((acc, curr) => {
        acc.total++;
        if (curr.result === 'PASS') acc.pass++;
        else if (curr.result === 'FAIL') acc.fail++;
        else if (curr.result === 'QUARANTINE') acc.quarantine++;
        return acc;
    }, { total: 0, pass: 0, fail: 0, quarantine: 0 });

    const quality: QualityControlSummary = {
        inspections: {
            ...inspectionStats,
            passRate: inspectionStats.total > 0 ? (inspectionStats.pass / inspectionStats.total) * 100 : 0
        },
        scrapByReason,
        scrapByProduct
    };

    const executions = await prisma.productionExecution.findMany({
        where: {
            startTime: { gte: startDate, lte: endDate }
        },
        include: {
            machine: true,
            operator: true
        }
    });

    const machineMap: Record<string, { machineName: string; totalOutput: number; operatingHours: number; scrap: number }> = {};
    const operatorMap: Record<string, { name: string; code: string; output: number; scrap: number; orders: Set<string> }> = {};

    executions.forEach(execution => {
        const quantity = Number(execution.quantityProduced);
        const scrap = Number(execution.scrapQuantity);

        let durationHours = 0;
        if (execution.endTime && execution.startTime) {
            durationHours = (new Date(execution.endTime).getTime() - new Date(execution.startTime).getTime()) / (1000 * 60 * 60);
        }

        if (execution.machine) {
            const machineCode = execution.machine.code;
            if (!machineMap[machineCode]) {
                machineMap[machineCode] = {
                    machineName: execution.machine.name,
                    totalOutput: 0,
                    operatingHours: 0,
                    scrap: 0
                };
            }
            machineMap[machineCode].totalOutput += quantity;
            machineMap[machineCode].scrap += scrap;
            machineMap[machineCode].operatingHours += durationHours;
        }

        if (execution.operator) {
            const operatorCode = execution.operator.code;
            if (!operatorMap[operatorCode]) {
                operatorMap[operatorCode] = {
                    name: execution.operator.name,
                    code: operatorCode,
                    output: 0,
                    scrap: 0,
                    orders: new Set()
                };
            }
            operatorMap[operatorCode].output += quantity;
            operatorMap[operatorCode].scrap += scrap;
            operatorMap[operatorCode].orders.add(execution.productionOrderId);
        }
    });

    const machinePerformance: MachinePerformanceItem[] = Object.entries(machineMap).map(([code, data]) => ({
        machineCode: code,
        machineName: data.machineName,
        totalOutput: data.totalOutput,
        totalOperatingHours: data.operatingHours,
        unitsPerHour: data.operatingHours > 0 ? data.totalOutput / data.operatingHours : 0,
        scrapRate: (data.totalOutput + data.scrap) > 0
            ? (data.scrap / (data.totalOutput + data.scrap)) * 100
            : 0
    }));

    const operatorProductivity: OperatorProductivityItem[] = Object.values(operatorMap).map(data => ({
        operatorName: data.name,
        operatorCode: data.code,
        totalQuantityProduced: data.output,
        totalScrapQuantity: data.scrap,
        ordersHandled: data.orders.size,
        scrapRate: (data.output + data.scrap) > 0
            ? (data.scrap / (data.output + data.scrap)) * 100
            : 0
    }));

    return {
        realization,
        quality,
        machinePerformance,
        operatorProductivity
    };
}