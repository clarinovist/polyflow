'use server';

import { prisma } from '@/lib/prisma';
import {
    DateRange,
    ProductionRealizationItem,
    MaterialUsageVarianceItem,
    MachinePerformanceItem,
    OperatorProductivityItem,
    QualityControlSummary,
    SalesRevenueTrend,
    TopCustomerItem,
    TopProductItem,
    SalesPipelineSummary,
    ARAgingItem,
    CustomerCreditItem,
} from '@/types/analytics';
import * as XLSX from 'xlsx';

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
    await prisma.productionOrder.findMany({
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
        const endTimeToUse = exec.endTime || new Date();
        const durationMs = endTimeToUse.getTime() - exec.startTime.getTime();
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
            startTime: {
                lte: dateRange.to,
            },
            OR: [
                { endTime: { gte: dateRange.from } },
                { endTime: null }
            ],
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

// ============================================
// SALES ANALYTICS ACTIONS
// ============================================

/**
 * 6. Sales Revenue Report
 * - Monthly Revenue & Order Count
 * - Includes previous period comparison for growth trends
 */
export async function getSalesRevenueReport(
    dateRange: DateRange
): Promise<SalesRevenueTrend> {
    // 1. Fetch Current Period Data
    const orders = await prisma.salesOrder.findMany({
        where: {
            orderDate: {
                gte: dateRange.from,
                lte: dateRange.to,
            },
            status: {
                not: 'CANCELLED'
            }
        },
        select: {
            orderDate: true,
            totalAmount: true,
            id: true
        },
        orderBy: { orderDate: 'asc' }
    });

    // 2. Fetch Previous Period Data for Trends
    const duration = dateRange.to.getTime() - dateRange.from.getTime();
    const prevFrom = new Date(dateRange.from.getTime() - duration);
    const prevTo = dateRange.from;

    const prevOrders = await prisma.salesOrder.findMany({
        where: {
            orderDate: {
                gte: prevFrom,
                lt: prevTo,
            },
            status: {
                not: 'CANCELLED'
            }
        },
        select: { totalAmount: true }
    });

    // Calculate Totals
    const currentRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const prevRevenue = prevOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    const currentCount = orders.length;
    const prevCount = prevOrders.length;

    // Calculate Growth
    const revenueGrowth = safePercentage(currentRevenue - prevRevenue, prevRevenue);
    const orderCountGrowth = safePercentage(currentCount - prevCount, prevCount);

    // Group by Month (or Day if range is small, but let's stick to Month for now based on request "Sales per Bulan")
    // If range is within a month, maybe group by day?
    // Let's implement a dynamic grouping helper or just simple monthly buffer if range > 32 days, else daily.

    const daysDiff = Math.ceil(duration / (1000 * 60 * 60 * 24));
    const isMonthly = daysDiff > 32;

    const chartMap = new Map<string, { revenue: number, count: number }>();

    orders.forEach(order => {
        const date = new Date(order.orderDate);
        let key = '';
        if (isMonthly) {
            key = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        } else {
            key = date.toLocaleString('default', { day: 'numeric', month: 'short' });
        }

        const current = chartMap.get(key) || { revenue: 0, count: 0 };
        current.revenue += Number(order.totalAmount) || 0;
        current.count += 1;
        chartMap.set(key, current);
    });

    const chartData = Array.from(chartMap.entries()).map(([period, data]) => ({
        period,
        revenue: data.revenue,
        orderCount: data.count,
        aov: data.count > 0 ? data.revenue / data.count : 0
    }));

    return {
        revenueGrowth,
        orderCountGrowth,
        chartData
    };
}

/**
 * 7. Top Customers
 * - Ranked by total spent
 */
export async function getTopCustomers(
    dateRange: DateRange,
    limit: number = 5
): Promise<TopCustomerItem[]> {
    const customers = await prisma.salesOrder.groupBy({
        by: ['customerId'],
        where: {
            orderDate: {
                gte: dateRange.from,
                lte: dateRange.to,
            },
            status: { not: 'CANCELLED' },
            customerId: { not: null }
        },
        _sum: {
            totalAmount: true
        },
        _count: {
            id: true
        },
        _max: {
            orderDate: true
        },
        orderBy: {
            _sum: {
                totalAmount: 'desc'
            }
        },
        take: limit
    });

    // Need to fetch customer names
    const customerIds = customers.map(c => c.customerId as string);
    const customerDetails = await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true }
    });

    const report: TopCustomerItem[] = customers.map(c => {
        const detail = customerDetails.find(d => d.id === c.customerId);
        return {
            customerId: c.customerId as string,
            customerName: detail?.name || 'Unknown',
            totalSpent: Number(c._sum.totalAmount) || 0,
            orderCount: c._count.id,
            lastOrderDate: c._max.orderDate
        };
    });

    return report;
}

/**
 * 8. Top Selling Products
 * - Ranked by Quantity/Revenue
 */
export async function getTopProducts(
    dateRange: DateRange,
    limit: number = 5
): Promise<TopProductItem[]> {
    const items = await prisma.salesOrderItem.groupBy({
        by: ['productVariantId'],
        where: {
            salesOrder: {
                orderDate: {
                    gte: dateRange.from,
                    lte: dateRange.to,
                },
                status: { not: 'CANCELLED' }
            }
        },
        _sum: {
            quantity: true,
            subtotal: true
        },
        orderBy: {
            _sum: {
                quantity: 'desc'
            }
        },
        take: limit
    });

    // Fetch product names
    const variantIds = items.map(i => i.productVariantId);
    const variants = await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, name: true, skuCode: true }
    });

    return items.map(item => {
        const variant = variants.find(v => v.id === item.productVariantId);
        return {
            productVariantId: item.productVariantId,
            productName: variant?.name || 'Unknown',
            skuCode: variant?.skuCode || 'Unknown',
            totalQuantity: Number(item._sum.quantity) || 0,
            totalRevenue: Number(item._sum.subtotal) || 0
        };
    });
}

/**
 * 9. Sales Pipeline Summary
 * - Distribution by Order Status
 */
export async function getSalesPipelineSummary(
    dateRange: DateRange
): Promise<SalesPipelineSummary[]> {
    const groups = await prisma.salesOrder.groupBy({
        by: ['status'],
        where: {
            orderDate: {
                gte: dateRange.from,
                lte: dateRange.to,
            }
        },
        _count: { id: true },
        _sum: { totalAmount: true }
    });

    const totalValue = groups.reduce((sum, g) => sum + (Number(g._sum.totalAmount) || 0), 0);

    return groups.map(g => ({
        status: g.status,
        count: g._count.id,
        value: Number(g._sum.totalAmount) || 0,
        percentage: safePercentage(Number(g._sum.totalAmount) || 0, totalValue)
    })).sort((a, b) => b.value - a.value);
}

/**
 * 10. Accounts Receivable (AR) Aging
 * - Unpaid invoices grouped by age
 */
export async function getARAgingReport(): Promise<ARAgingItem[]> {
    // Determine aging based on dueDate or invoiceDate? Usually dueDate.
    // However, if dueDate is null, use invoiceDate?
    // Let's rely on dueDate for aging calculations.

    const unpaidInvoices = await prisma.invoice.findMany({
        where: {
            status: { notIn: ['PAID', 'CANCELLED'] }
        },
        select: {
            id: true,
            totalAmount: true,
            paidAmount: true,
            dueDate: true,
            invoiceDate: true
        }
    });

    const categories: Record<string, ARAgingItem> = {
        'Current': { range: 'Current', amount: 0, invoiceCount: 0 },
        '1-30 Days': { range: '1-30 Days', amount: 0, invoiceCount: 0 },
        '31-60 Days': { range: '31-60 Days', amount: 0, invoiceCount: 0 },
        '61-90 Days': { range: '61-90 Days', amount: 0, invoiceCount: 0 },
        '> 90 Days': { range: '> 90 Days', amount: 0, invoiceCount: 0 },
    };

    const now = new Date();

    for (const inv of unpaidInvoices) {
        const due = inv.dueDate || inv.invoiceDate; // Fallback
        const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);

        // Diff in days
        const diffTime = now.getTime() - due.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let categoryKey = 'Current';
        if (diffDays <= 0) categoryKey = 'Current'; // Not overdue yet
        else if (diffDays <= 30) categoryKey = '1-30 Days';
        else if (diffDays <= 60) categoryKey = '31-60 Days';
        else if (diffDays <= 90) categoryKey = '61-90 Days';
        else categoryKey = '> 90 Days';

        categories[categoryKey].amount += outstanding;
        categories[categoryKey].invoiceCount += 1;
    }

    return Object.values(categories);
}

/**
 * 11. Customer Credit Report
 * - High utilization customers
 */
export async function getCustomerCreditReport(
    limit: number = 10
): Promise<CustomerCreditItem[]> {
    // 1. Get customers with credit limit
    const customers = await prisma.customer.findMany({
        where: {
            creditLimit: { not: null },
            isActive: true
        }
    });


    // We need to map back to customer.
    // Let's fetch the salesOrder -> customer mapping for these invoices.
    // Or simpler: fetch unpaid invoices with salesOrder.customerId
    const unpaidInvoices = await prisma.invoice.findMany({
        where: {
            salesOrder: { customerId: { in: customers.map(c => c.id) } },
            status: { notIn: ['PAID', 'CANCELLED'] }
        },
        include: {
            salesOrder: {
                select: { customerId: true }
            }
        }
    });

    const usageMap = new Map<string, number>();
    for (const inv of unpaidInvoices) {
        const custId = inv.salesOrder.customerId;
        if (!custId) continue;
        const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
        usageMap.set(custId, (usageMap.get(custId) || 0) + outstanding);
    }

    const report: CustomerCreditItem[] = [];

    for (const cust of customers) {
        const used = usageMap.get(cust.id) || 0;
        const limit = Number(cust.creditLimit) || 0;

        if (limit === 0 && used === 0) continue;

        const rate = limit > 0 ? (used / limit) * 100 : 0;

        let status: 'Safe' | 'Warning' | 'Critical' = 'Safe';
        if (rate >= 90) status = 'Critical';
        else if (rate >= 70) status = 'Warning';

        // Only include if there's usage or limit
        report.push({
            customerName: cust.name,
            creditLimit: limit,
            usedCredit: used,
            utilizationRate: Number(rate.toFixed(2)),
            status
        });
    }

    // Sort by utilization rate descending
    return report.sort((a, b) => b.utilizationRate - a.utilizationRate).slice(0, limit);
}

/**
 * Aggregated Sales Analytics for Dashboard
 */
export async function getSalesAnalytics(dateRange?: DateRange) {
    const today = new Date();
    const endOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    // Default to last 6 months for trend
    const defaultFrom = new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const defaultTo = endOfCurrentMonth;

    const queryRange = dateRange || { from: defaultFrom, to: defaultTo };

    const [revenueTrend, topProducts, pipeline, arAging] = await Promise.all([
        getSalesRevenueReport(queryRange),
        getTopProducts(queryRange),
        getSalesPipelineSummary(queryRange),
        getARAgingReport()
    ]);

    return {
        revenueTrend: revenueTrend.chartData,
        topProducts,
        pipeline,
        arAging
    };
}

/**
 * Export Sales Analytics Report
 */
export async function exportSalesAnalytics(dateRange: DateRange) {
    try {
        const [revenueTrend, topProducts, pipeline, arAging] = await Promise.all([
            getSalesRevenueReport(dateRange),
            getTopProducts(dateRange),
            getSalesPipelineSummary(dateRange),
            getARAgingReport()
        ]);

        const workbook = XLSX.utils.book_new();

        // 1. Revenue Sheet
        const revenueSheet = XLSX.utils.json_to_sheet(revenueTrend.chartData.map(r => ({
            Period: r.period,
            Revenue: r.revenue,
            'Order Count': r.orderCount,
            AOV: r.aov
        })));
        XLSX.utils.book_append_sheet(workbook, revenueSheet, 'Revenue Trend');

        // 2. Top Products Sheet
        const productsSheet = XLSX.utils.json_to_sheet(topProducts.map(p => ({
            Product: p.productName,
            SKU: p.skuCode,
            Quantity: p.totalQuantity,
            Revenue: p.totalRevenue
        })));
        XLSX.utils.book_append_sheet(workbook, productsSheet, 'Top Products');

        // 3. Pipeline Sheet
        const pipelineSheet = XLSX.utils.json_to_sheet(pipeline.map(p => ({
            Status: p.status,
            Count: p.count,
            Value: p.value,
            Percentage: `${p.percentage.toFixed(2)}%`
        })));
        XLSX.utils.book_append_sheet(workbook, pipelineSheet, 'Pipeline');

        // 4. AR Aging Sheet
        const arSheet = XLSX.utils.json_to_sheet(arAging.map(a => ({
            Range: a.range,
            Amount: a.amount,
            'Invoice Count': a.invoiceCount
        })));
        XLSX.utils.book_append_sheet(workbook, arSheet, 'AR Aging');

        const buffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

        return { data: buffer, error: null };
    } catch (error) {
        console.error('Export error:', error);
        return { data: null, error: 'Failed to generate report' };
    }
}

/**
 * Aggregated Production Analytics
 */
export async function getProductionAnalytics(dateRange?: DateRange) {
    const today = new Date();
    const endOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const defaultFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1); // Last month default
    const defaultTo = endOfCurrentMonth;

    const queryRange = dateRange || { from: defaultFrom, to: defaultTo };

    const [realization, materialVariance, machinePerformance, operatorProductivity, quality] = await Promise.all([
        getProductionRealizationReport(queryRange),
        getMaterialUsageVarianceReport(queryRange),
        getMachinePerformanceReport(queryRange),
        getOperatorProductivityLeaderboard(queryRange),
        getQualityControlSummary(queryRange)
    ]);

    return {
        realization,
        materialVariance,
        machinePerformance,
        operatorProductivity,
        quality
    };
}

/**
 * Export Production Analytics Report
 */
export async function exportProductionAnalytics(dateRange: DateRange) {
    try {
        const [realization, materialVariance, machinePerformance, operatorProductivity, quality] = await Promise.all([
            getProductionRealizationReport(dateRange),
            getMaterialUsageVarianceReport(dateRange),
            getMachinePerformanceReport(dateRange),
            getOperatorProductivityLeaderboard(dateRange),
            getQualityControlSummary(dateRange)
        ]);

        const workbook = XLSX.utils.book_new();

        // 1. Realization Sheet
        const realizationSheet = XLSX.utils.json_to_sheet(realization.map(r => ({
            'Order #': r.orderNumber,
            Product: r.productName,
            'Planned Qty': r.plannedQuantity,
            'Actual Qty': r.actualQuantity,
            'Yield Rate (%)': r.yieldRate.toFixed(2),
            Status: r.status,
            'Schedule Adherence': r.scheduleAdherence
        })));
        XLSX.utils.book_append_sheet(workbook, realizationSheet, 'Realization');

        // 2. Material Variance Sheet
        const materialSheet = XLSX.utils.json_to_sheet(materialVariance.map(m => ({
            'Order #': m.orderNumber,
            Material: m.materialName,
            'Standard Qty': m.standardQuantity,
            'Actual Qty': m.actualQuantity,
            Variance: m.variance,
            'Variance (%)': m.variancePercentage.toFixed(2)
        })));
        XLSX.utils.book_append_sheet(workbook, materialSheet, 'Material Variance');

        // 3. Machine Performance Sheet
        const machineSheet = XLSX.utils.json_to_sheet(machinePerformance.map(m => ({
            Machine: m.machineName,
            Output: m.totalOutput,
            'Operating Hours': m.totalOperatingHours,
            'Units/Hour': m.unitsPerHour,
            'Scrap Rate (%)': m.scrapRate.toFixed(2)
        })));
        XLSX.utils.book_append_sheet(workbook, machineSheet, 'Machine Perf');

        // 4. Operator Sheet
        const operatorSheet = XLSX.utils.json_to_sheet(operatorProductivity.map(o => ({
            Operator: o.operatorName,
            Output: o.totalQuantityProduced,
            Scrap: o.totalScrapQuantity,
            'Scrap Rate (%)': o.scrapRate.toFixed(2),
            'Orders Handled': o.ordersHandled
        })));
        XLSX.utils.book_append_sheet(workbook, operatorSheet, 'Operator Perf');

        // 5. Quality Sheet
        const qualitySheet = XLSX.utils.json_to_sheet([
            {
                Title: 'Inspection Summary',
                Total: quality.inspections.total,
                Pass: quality.inspections.pass,
                Fail: quality.inspections.fail,
                Quarantine: quality.inspections.quarantine,
                'Pass Rate (%)': quality.inspections.passRate.toFixed(2)
            },
            {},
            { Title: 'Scrap Reasons' },
            ...quality.scrapByReason.map(s => ({
                Reason: s.reason,
                Qty: s.quantity,
                'Percentage (%)': s.percentage.toFixed(2)
            }))
        ]);
        XLSX.utils.book_append_sheet(workbook, qualitySheet, 'Quality QC');

        const buffer = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

        return { data: buffer, error: null };
    } catch (error) {
        console.error('Export error:', error);
        return { data: null, error: 'Failed to generate report' };
    }
}
