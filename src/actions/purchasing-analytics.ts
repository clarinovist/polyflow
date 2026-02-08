'use server';

import { prisma } from '@/lib/prisma';
import { PurchaseSpendTrend, TopSupplierItem, PurchaseByStatusItem, APAgingItem, DateRange } from '@/types/analytics';

function safePercentage(numerator: number, denominator: number): number {
    if (denominator === 0) return 0;
    return (numerator / denominator) * 100;
}

export async function getPurchaseSpendReport(
    dateRange: DateRange
): Promise<PurchaseSpendTrend> {
    const now = new Date();
    // Trend starts from Jan 1st of current year
    const trendStartDate = new Date(now.getFullYear(), 0, 1);
    const trendEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const monthsInTrend = (trendEndDate.getFullYear() - trendStartDate.getFullYear()) * 12 + trendEndDate.getMonth() + 1;

    // 1. Fetch Current Period Data
    const orders = await prisma.purchaseOrder.findMany({
        where: {
            orderDate: {
                gte: trendStartDate < dateRange.from ? trendStartDate : dateRange.from,
                lte: trendEndDate > dateRange.to ? trendEndDate : dateRange.to,
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

    // 2. Fetch Previous Period Data for Trends (KPIs only)
    const duration = dateRange.to.getTime() - dateRange.from.getTime();
    const prevFrom = new Date(dateRange.from.getTime() - duration);
    const prevTo = dateRange.from;

    const prevOrders = await prisma.purchaseOrder.findMany({
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

    // Filter orders for KPI calculations
    const kpiOrders = orders.filter(o => o.orderDate >= dateRange.from && o.orderDate <= dateRange.to);

    // Calculate Totals
    const currentSpend = kpiOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const prevSpend = prevOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

    const currentCount = kpiOrders.length;
    const prevCount = prevOrders.length;

    // Calculate Growth
    const spendGrowth = safePercentage(currentSpend - prevSpend, prevSpend);
    const orderCountGrowth = safePercentage(currentCount - prevCount, prevCount);

    const chartMap: Record<string, number> = {};

    // Initialize monthly map for the whole year
    for (let i = 0; i < monthsInTrend; i++) {
        const date = new Date(trendStartDate.getFullYear(), trendStartDate.getMonth() + i, 1);
        const key = date.toLocaleString('default', { month: 'short', year: 'numeric' });
        chartMap[key] = 0;
    }

    orders.forEach(order => {
        const date = new Date(order.orderDate);
        const key = date.toLocaleString('default', { month: 'short', year: 'numeric' });

        if (chartMap[key] !== undefined) {
            chartMap[key] += Number(order.totalAmount) || 0;
        }
    });

    const chartData = Object.entries(chartMap).map(([period, spend]) => ({
        period,
        spend: spend as number,
        orderCount: 0 // We aren't tracking monthly count in UI but keep type compatibility
    }));

    return {
        spendGrowth,
        orderCountGrowth,
        periodSpend: currentSpend,
        periodOrderCount: currentCount,
        chartData
    };
}

export async function getTopSuppliers(
    dateRange: DateRange,
    limit: number = 5
): Promise<TopSupplierItem[]> {
    const suppliers = await prisma.purchaseOrder.groupBy({
        by: ['supplierId'],
        where: {
            orderDate: {
                gte: dateRange.from,
                lte: dateRange.to,
            },
            status: { not: 'CANCELLED' }
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

    // Need to fetch supplier names
    const supplierIds = suppliers.map(s => s.supplierId);
    const supplierDetails = await prisma.supplier.findMany({
        where: { id: { in: supplierIds } },
        select: { id: true, name: true }
    });

    return suppliers.map(s => {
        const detail = supplierDetails.find(d => d.id === s.supplierId);
        return {
            supplierId: s.supplierId,
            supplierName: detail?.name || 'Unknown',
            totalSpend: Number(s._sum.totalAmount) || 0,
            orderCount: s._count.id,
            lastOrderDate: s._max.orderDate
        };
    });
}

export async function getPurchaseStatusSummary(
    dateRange: DateRange
): Promise<PurchaseByStatusItem[]> {
    const groups = await prisma.purchaseOrder.groupBy({
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

export async function getAPAgingReport(): Promise<APAgingItem[]> {
    const unpaidInvoices = await prisma.purchaseInvoice.findMany({
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

    const categories: Record<string, APAgingItem> = {
        'Current': { range: 'Current', amount: 0, invoiceCount: 0 },
        '1-30 Days': { range: '1-30 Days', amount: 0, invoiceCount: 0 },
        '31-60 Days': { range: '31-60 Days', amount: 0, invoiceCount: 0 },
        '61-90 Days': { range: '61-90 Days', amount: 0, invoiceCount: 0 },
        '> 90 Days': { range: '> 90 Days', amount: 0, invoiceCount: 0 },
    };

    const now = new Date();

    for (const inv of unpaidInvoices) {
        const due = inv.dueDate || inv.invoiceDate;
        const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);

        const diffTime = now.getTime() - due.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        let categoryKey = 'Current';
        if (diffDays <= 0) categoryKey = 'Current';
        else if (diffDays <= 30) categoryKey = '1-30 Days';
        else if (diffDays <= 60) categoryKey = '31-60 Days';
        else if (diffDays <= 90) categoryKey = '61-90 Days';
        else categoryKey = '> 90 Days';

        categories[categoryKey].amount += outstanding;
        categories[categoryKey].invoiceCount += 1;
    }

    return Object.values(categories);
}

export async function getPurchasingAnalytics(dateRange?: DateRange) {
    const today = new Date();
    const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    const queryRange = dateRange || { from: startOfCurrentMonth, to: endOfCurrentMonth };

    const [spendTrend, topSuppliers, statusBreakdown, apAging] = await Promise.all([
        getPurchaseSpendReport(queryRange),
        getTopSuppliers(queryRange),
        getPurchaseStatusSummary(queryRange),
        getAPAgingReport()
    ]);

    return {
        spendTrend,
        topSuppliers,
        statusBreakdown,
        apAging
    };
}
