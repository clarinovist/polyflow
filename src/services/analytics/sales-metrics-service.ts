import { endOfDay, format, startOfMonth } from 'date-fns';

import { prisma } from '@/lib/core/prisma';
import { DateRange, TopProductItem, TopCustomerItem } from '@/types/analytics';

export interface SalesMetrics {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
    revenueTrend: { date: string; revenue: number }[];
    topProducts: TopProductItem[];
    topCustomers: TopCustomerItem[];
}

export async function getSalesMetrics(dateRange?: DateRange): Promise<SalesMetrics> {
    const now = new Date();
    const endDate = dateRange?.to || endOfDay(now);
    const startDate = dateRange?.from || startOfMonth(now);

    const trendStartDate = new Date(now.getFullYear(), 0, 1);
    const trendEndDate = endOfDay(now);
    const monthsInTrend = (trendEndDate.getFullYear() - trendStartDate.getFullYear()) * 12 + trendEndDate.getMonth() + 1;

    const orders = await prisma.salesOrder.findMany({
        where: {
            orderDate: {
                gte: trendStartDate < startDate ? trendStartDate : startDate,
                lte: trendEndDate > endDate ? trendEndDate : endDate
            },
            invoices: {
                some: {
                    status: {
                        in: ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE']
                    }
                }
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
            customer: true,
            invoices: true
        }
    });

    const revenueAgg = await prisma.journalLine.aggregate({
        where: {
            account: { code: { startsWith: '4' } },
            journalEntry: {
                status: 'POSTED',
                entryDate: { gte: startDate, lte: endDate }
            }
        },
        _sum: { credit: true, debit: true }
    });
    const totalRevenue = (Number(revenueAgg._sum.credit) || 0) - (Number(revenueAgg._sum.debit) || 0);

    let kpiOrderCount = 0;
    const monthlyRevenue: Record<string, number> = {};
    const productStats: Record<string, { productVariantId: string; productName: string; skuCode: string; totalQuantity: number; totalRevenue: number }> = {};
    const customerStats: Record<string, { customerId: string; customerName: string; orderCount: number; totalSpent: number; lastOrderDate: Date | null }> = {};

    for (let i = 0; i < monthsInTrend; i++) {
        const date = new Date(trendStartDate.getFullYear(), trendStartDate.getMonth() + i, 1);
        const monthStr = format(date, 'yyyy-MM');
        monthlyRevenue[monthStr] = 0;
    }

    for (const order of orders) {
        const orderTotal = Number(order.totalAmount || 0);
        const orderMonthStr = format(order.orderDate, 'yyyy-MM');
        const inKPIRange = order.orderDate >= startDate && order.orderDate <= endDate;

        if (monthlyRevenue[orderMonthStr] !== undefined) {
            monthlyRevenue[orderMonthStr] += orderTotal;
        }

        if (!inKPIRange) {
            continue;
        }

        kpiOrderCount++;

        if (order.customer) {
            const customerId = order.customerId!;
            if (!customerStats[customerId]) {
                customerStats[customerId] = { customerId, customerName: order.customer.name, orderCount: 0, totalSpent: 0, lastOrderDate: null };
            }
            customerStats[customerId].orderCount++;
            customerStats[customerId].totalSpent += orderTotal;
            if (!customerStats[customerId].lastOrderDate || order.orderDate > customerStats[customerId].lastOrderDate!) {
                customerStats[customerId].lastOrderDate = order.orderDate;
            }
        }

        for (const item of order.items) {
            const variantId = item.productVariantId;
            const quantity = Number(item.quantity);
            const gross = Number(item.quantity) * Number(item.unitPrice);
            const discount = gross * (Number(item.discountPercent || 0) / 100);
            const subtotal = gross - discount;

            if (!productStats[variantId]) {
                const productName = item.productVariant.product.name === item.productVariant.name
                    ? item.productVariant.name
                    : `${item.productVariant.product.name} - ${item.productVariant.name}`;

                productStats[variantId] = { productVariantId: variantId, productName, skuCode: item.productVariant.skuCode, totalQuantity: 0, totalRevenue: 0 };
            }

            productStats[variantId].totalQuantity += quantity;
            productStats[variantId].totalRevenue += subtotal;
        }
    }

    const averageOrderValue = kpiOrderCount > 0 ? totalRevenue / kpiOrderCount : 0;

    const revenueTrend = Object.entries(monthlyRevenue)
        .map(([date, revenue]) => ({ date, revenue }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const topProducts = Object.values(productStats)
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 5);

    const topCustomers = Object.values(customerStats)
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 5);

    return {
        totalRevenue,
        totalOrders: kpiOrderCount,
        averageOrderValue,
        revenueTrend,
        topProducts,
        topCustomers
    };
}