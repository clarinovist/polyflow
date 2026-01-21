import { prisma } from '@/lib/prisma';
import { SalesOrderStatus } from '@prisma/client';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';

export interface SalesMetrics {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    revenueTrend: { date: string; revenue: number }[];
    topProducts: { name: string; quantity: number; revenue: number }[];
    topCustomers: { name: string; salesCount: number; revenue: number }[];
}

import {
    DateRange,
    ProductionRealizationItem,
    MachinePerformanceItem,
    OperatorProductivityItem,
    QualityControlSummary
} from '@/types/analytics';

export interface ProductionAnalyticsData {
    realization: ProductionRealizationItem[];
    quality: QualityControlSummary;
    machinePerformance: MachinePerformanceItem[];
    operatorProductivity: OperatorProductivityItem[];
}

export class AnalyticsService {
    static async getSalesMetrics(days: number = 30): Promise<SalesMetrics> {
        const endDate = endOfDay(new Date());
        const startDate = startOfDay(subDays(new Date(), days));

        // 1. Fetch relevant orders
        const orders = await prisma.salesOrder.findMany({
            where: {
                orderDate: {
                    gte: startDate,
                    lte: endDate
                },
                status: {
                    in: [SalesOrderStatus.CONFIRMED, SalesOrderStatus.SHIPPED, SalesOrderStatus.DELIVERED]
                }
            },
            include: {
                items: {
                    include: {
                        productVariant: {
                            include: { product: true }
                        }
                    }
                },
                customer: true
            }
        });

        // 2. Aggregate Key Metrics
        let totalRevenue = 0;
        const totalOrders = orders.length;

        // Aggregation maps
        const dailyRevenue: Record<string, number> = {};
        const productStats: Record<string, { name: string; quantity: number; revenue: number }> = {};
        const customerStats: Record<string, { name: string; salesCount: number; revenue: number }> = {};

        // Initialize daily revenue map for the range to fill gaps
        for (let i = 0; i <= days; i++) {
            const dateStr = format(subDays(endDate, i), 'yyyy-MM-dd');
            dailyRevenue[dateStr] = 0;
        }

        // Process Orders
        for (const order of orders) {
            const orderTotal = Number(order.totalAmount || 0);
            const orderDateStr = format(order.orderDate, 'yyyy-MM-dd');

            // Total Stats
            totalRevenue += orderTotal;

            // Daily Stat
            // If order date is within range (it should be due to query), add to map
            // Use date string from orderDate which might be slightly off if timezone differs, but consistent for daily buckets based on UTC usually if raw Date.
            // Let's rely on format() handling local/UTC consistent with app.
            if (dailyRevenue[orderDateStr] !== undefined) {
                dailyRevenue[orderDateStr] += orderTotal;
            } else {
                // Fallback if date is slightly out of generated range due to time boundary
                dailyRevenue[orderDateStr] = (dailyRevenue[orderDateStr] || 0) + orderTotal;
            }

            // Customer Stat
            if (order.customer) {
                const custId = order.customerId!;
                if (!customerStats[custId]) {
                    customerStats[custId] = { name: order.customer.name, salesCount: 0, revenue: 0 };
                }
                customerStats[custId].salesCount++;
                customerStats[custId].revenue += orderTotal;
            }

            // Product Stats
            for (const item of order.items) {
                const variantId = item.productVariantId;
                const qty = Number(item.quantity);
                // Simple revenue attribution per item strictly based on (Qty * Price) - Discount
                // In SalesOrder, totalAmount is final. Here we estimate SKU contribution.
                const gross = Number(item.quantity) * Number(item.unitPrice);
                const discount = gross * (Number(item.discountPercent || 0) / 100);
                const subtotal = gross - discount;

                if (!productStats[variantId]) {
                    const pName = item.productVariant.product.name === item.productVariant.name
                        ? item.productVariant.name
                        : `${item.productVariant.product.name} - ${item.productVariant.name}`;

                    productStats[variantId] = { name: pName, quantity: 0, revenue: 0 };
                }
                productStats[variantId].quantity += qty;
                productStats[variantId].revenue += subtotal;
            }
        }

        // 3. Format Output
        const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        const revenueTrend = Object.entries(dailyRevenue)
            .map(([date, revenue]) => ({ date, revenue }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const topProducts = Object.values(productStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        const topCustomers = Object.values(customerStats)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5);

        return {
            totalRevenue,
            totalOrders,
            averageOrderValue,
            revenueTrend,
            topProducts,
            topCustomers
        };
    }

    static async getProductionAnalytics(dateRange?: DateRange): Promise<ProductionAnalyticsData> {
        const endDate = dateRange?.to || endOfDay(new Date());
        const startDate = dateRange?.from || startOfDay(subDays(new Date(), 30));

        // 1. Fetch Production Orders for Realization
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

            // Basic logic for schedule adherence
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

        // 2. Fetch Scrap Records
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

        const scrapByReason = Object.entries(scrapByReasonMap).map(([reason, quantity]) => ({
            reason,
            quantity,
            percentage: totalScrap > 0 ? (quantity / totalScrap) * 100 : 0
        })).sort((a, b) => b.quantity - a.quantity);

        // 3. Fetch Quality Inspections
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

        const passRate = inspectionStats.total > 0
            ? (inspectionStats.pass / inspectionStats.total) * 100
            : 0;

        const quality: QualityControlSummary = {
            inspections: { ...inspectionStats, passRate },
            scrapByReason
        };

        // 4. Fetch Machine Performance & Operator Productivity via Executions
        const executions = await prisma.productionExecution.findMany({
            where: {
                startTime: { gte: startDate, lte: endDate }
            },
            include: {
                machine: true,
                operator: true
            }
        });

        // Machine Stats
        const machineMap: Record<string, { machineName: string; totalOutput: number; operatingHours: number; scrap: number }> = {};

        // Operator Stats
        const operatorMap: Record<string, { name: string; code: string; output: number; scrap: number; orders: Set<string> }> = {};

        executions.forEach(ex => {
            const qty = Number(ex.quantityProduced);
            const scrap = Number(ex.scrapQuantity);

            // Duration in hours
            let durationHours = 0;
            if (ex.endTime && ex.startTime) {
                durationHours = (new Date(ex.endTime).getTime() - new Date(ex.startTime).getTime()) / (1000 * 60 * 60);
            }

            // Machine
            if (ex.machine) {
                const mCode = ex.machine.code;
                if (!machineMap[mCode]) {
                    machineMap[mCode] = {
                        machineName: ex.machine.name,
                        totalOutput: 0,
                        operatingHours: 0,
                        scrap: 0
                    };
                }
                machineMap[mCode].totalOutput += qty;
                machineMap[mCode].scrap += scrap;
                machineMap[mCode].operatingHours += durationHours;
            }

            // Operator
            if (ex.operator) {
                const opCode = ex.operator.code;
                if (!operatorMap[opCode]) {
                    operatorMap[opCode] = {
                        name: ex.operator.name,
                        code: opCode,
                        output: 0,
                        scrap: 0,
                        orders: new Set()
                    };
                }
                operatorMap[opCode].output += qty;
                operatorMap[opCode].scrap += scrap;
                operatorMap[opCode].orders.add(ex.productionOrderId);
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
}
