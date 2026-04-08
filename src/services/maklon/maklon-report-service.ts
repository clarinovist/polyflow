import { prisma } from '@/lib/core/prisma';

export type MaklonCostBreakdown = {
    LABOR: number;
    MACHINE: number;
    ELECTRICITY: number;
    ADDITIVE: number;
    COLORANT: number;
    OVERHEAD: number;
    OTHER: number;
};

export type MaklonOrderReport = {
    productionOrderId: string;
    productionOrderNumber: string;
    productionStatus: string;
    salesOrderId: string | null;
    salesOrderNumber: string | null;
    salesOrderStatus: string | null;
    invoiced: boolean;
    invoiceNumber: string | null;
    invoiceStatus: string | null;
    // Financial data
    serviceRevenue: number; // from Sales Order total amount
    totalInternalCost: number; // sum of MaklonCostItems
    grossMargin: number; // serviceRevenue - totalInternalCost
    grossMarginPct: number; // percentage, 0 if no revenue
    costBreakdown: MaklonCostBreakdown;
    // Dates
    plannedStartDate: Date;
    actualEndDate: Date | null;
};

export type MaklonCustomerReport = {
    customerId: string;
    customerName: string;
    orderCount: number;
    totalServiceRevenue: number;
    totalInternalCost: number;
    totalGrossMargin: number;
    avgMarginPct: number;
    orders: MaklonOrderReport[];
};

export type MaklonReportSummary = {
    totalOrders: number;
    totalServiceRevenue: number;
    totalInternalCost: number;
    totalGrossMargin: number;
    avgMarginPct: number;
    byCustomer: MaklonCustomerReport[];
    totalCostBreakdown: MaklonCostBreakdown;
};

const EMPTY_BREAKDOWN: MaklonCostBreakdown = {
    LABOR: 0,
    MACHINE: 0,
    ELECTRICITY: 0,
    ADDITIVE: 0,
    COLORANT: 0,
    OVERHEAD: 0,
    OTHER: 0,
};

export class MaklonReportService {
    static async getReport(filters?: {
        startDate?: Date;
        endDate?: Date;
        customerId?: string;
    }): Promise<MaklonReportSummary> {
        // Fetch all maklon production orders with their related data
        const productionOrders = await prisma.productionOrder.findMany({
            where: {
                isMaklon: true,
                ...(filters?.startDate || filters?.endDate
                    ? {
                          plannedStartDate: {
                              ...(filters.startDate && { gte: filters.startDate }),
                              ...(filters.endDate && { lte: filters.endDate }),
                          },
                      }
                    : {}),
                ...(filters?.customerId
                    ? { maklonCustomerId: filters.customerId }
                    : {}),
            },
            include: {
                maklonCustomer: { select: { id: true, name: true } },
                maklonCostItems: true,
                salesOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        status: true,
                        totalAmount: true,
                        invoices: {
                            select: {
                                invoiceNumber: true,
                                status: true,
                            },
                            take: 1,
                            orderBy: { createdAt: 'asc' },
                        },
                    },
                },
            },
            orderBy: { plannedStartDate: 'desc' },
        });

        // Group by customer
        const byCustomer = new Map<string, MaklonCustomerReport>();

        for (const po of productionOrders) {
            // Skip if customer info is missing
            const customerId = po.maklonCustomerId ?? '__unknown__';
            const customerName = po.maklonCustomer?.name ?? 'Unknown Customer';

            // Compute cost breakdown
            const costBreakdown: MaklonCostBreakdown = { ...EMPTY_BREAKDOWN };
            for (const item of po.maklonCostItems) {
                const type = item.costType as keyof MaklonCostBreakdown;
                if (type in costBreakdown) {
                    costBreakdown[type] += Number(item.amount);
                }
            }
            const totalInternalCost = Object.values(costBreakdown).reduce(
                (sum, v) => sum + v,
                0
            );

            // Service revenue = invoiced SO amount. Fall back to 0 if not set.
            const serviceRevenue = po.salesOrder?.totalAmount
                ? Number(po.salesOrder.totalAmount)
                : 0;

            const grossMargin = serviceRevenue - totalInternalCost;
            const grossMarginPct =
                serviceRevenue > 0
                    ? (grossMargin / serviceRevenue) * 100
                    : 0;

            const firstInvoice = po.salesOrder?.invoices?.[0] ?? null;

            const orderReport: MaklonOrderReport = {
                productionOrderId: po.id,
                productionOrderNumber: po.orderNumber,
                productionStatus: po.status,
                salesOrderId: po.salesOrderId ?? null,
                salesOrderNumber: po.salesOrder?.orderNumber ?? null,
                salesOrderStatus: po.salesOrder?.status ?? null,
                invoiced: !!firstInvoice,
                invoiceNumber: firstInvoice?.invoiceNumber ?? null,
                invoiceStatus: firstInvoice?.status ?? null,
                serviceRevenue,
                totalInternalCost,
                grossMargin,
                grossMarginPct,
                costBreakdown,
                plannedStartDate: po.plannedStartDate,
                actualEndDate: po.actualEndDate ?? null,
            };

            if (!byCustomer.has(customerId)) {
                byCustomer.set(customerId, {
                    customerId,
                    customerName,
                    orderCount: 0,
                    totalServiceRevenue: 0,
                    totalInternalCost: 0,
                    totalGrossMargin: 0,
                    avgMarginPct: 0,
                    orders: [],
                });
            }

            const customerReport = byCustomer.get(customerId)!;
            customerReport.orderCount += 1;
            customerReport.totalServiceRevenue += serviceRevenue;
            customerReport.totalInternalCost += totalInternalCost;
            customerReport.totalGrossMargin += grossMargin;
            customerReport.orders.push(orderReport);
        }

        // Compute avg margin per customer
        const customerList = Array.from(byCustomer.values()).map((cr) => ({
            ...cr,
            avgMarginPct:
                cr.totalServiceRevenue > 0
                    ? (cr.totalGrossMargin / cr.totalServiceRevenue) * 100
                    : 0,
        }));

        // Totals
        const totalServiceRevenue = customerList.reduce(
            (s, c) => s + c.totalServiceRevenue,
            0
        );
        const totalInternalCost = customerList.reduce(
            (s, c) => s + c.totalInternalCost,
            0
        );
        const totalGrossMargin = totalServiceRevenue - totalInternalCost;
        const avgMarginPct =
            totalServiceRevenue > 0
                ? (totalGrossMargin / totalServiceRevenue) * 100
                : 0;

        // Aggregate total cost breakdown
        const totalCostBreakdown: MaklonCostBreakdown = { ...EMPTY_BREAKDOWN };
        for (const c of customerList) {
            for (const o of c.orders) {
                for (const k of Object.keys(EMPTY_BREAKDOWN) as (keyof MaklonCostBreakdown)[]) {
                    totalCostBreakdown[k] += o.costBreakdown[k];
                }
            }
        }

        return {
            totalOrders: productionOrders.length,
            totalServiceRevenue,
            totalInternalCost,
            totalGrossMargin,
            avgMarginPct,
            byCustomer: customerList,
            totalCostBreakdown,
        };
    }

    static async getCustomers() {
        return prisma.customer.findMany({
            where: {
                maklonOrders: { some: {} },
            },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
    }
}
