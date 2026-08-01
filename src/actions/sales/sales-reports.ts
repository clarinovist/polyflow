'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { safeAction } from '@/lib/errors/errors';

export type SalesPerformanceRow = {
    period: string;
    orderId: string;
    orderNumber: string;
    orderDate: Date;
    customerName: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    totalAmount: number;
    status: string;
    invoiceStatus: string | null;
    salesPerson: string;
};

export type SalesPerformanceSummary = {
    totalRevenue: number;
    totalOrders: number;
    totalCustomers: number;
    avgOrderValue: number;
    topCustomers: { name: string; revenue: number; orders: number }[];
    topProducts: { name: string; revenue: number; quantity: number }[];
    bySalesperson: {
        userId: string;
        name: string;
        revenue: number;
        orders: number;
        avgOrderValue: number;
        portfolioSize: number;
        visitCount: number;
    }[];
};

export const getSalesPerformanceReport = withTenant(
    async function getSalesPerformanceReport(filters?: {
        startDate?: Date;
        endDate?: Date;
        customerId?: string;
    }) {
        return safeAction(async () => {
            await requireAuth();

            const where: Record<string, unknown> = {
                status: { not: 'CANCELLED' },
            };

            if (filters?.startDate && filters?.endDate) {
                where.orderDate = {
                    gte: filters.startDate,
                    lte: filters.endDate,
                };
            }

            if (filters?.customerId) {
                where.customerId = filters.customerId;
            }

            const orders = await prisma.salesOrder.findMany({
                where,
                include: {
                    customer: { select: { name: true } },
                    salesRep: { select: { id: true, name: true } },
                    items: {
                        include: {
                            productVariant: {
                                include: {
                                    product: { select: { name: true } },
                                },
                            },
                        },
                    },
                    invoices: {
                        select: { status: true },
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                    },
                },
                orderBy: { orderDate: 'desc' },
            });

            const rows: SalesPerformanceRow[] = orders.flatMap((order) =>
                order.items.map((item) => ({
                    period: order.orderDate.toISOString().slice(0, 7),
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    orderDate: order.orderDate,
                    customerName: order.customer?.name || '-',
                    productName:
                        item.productVariant?.product?.name ||
                        item.productVariant?.name ||
                        '-',
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    subtotal: Number(item.subtotal),
                    totalAmount: Number(order.totalAmount || 0),
                    status: order.status,
                    invoiceStatus: order.invoices[0]?.status || null,
                    salesPerson: order.salesRep?.name || '-',
                })),
            );

            // Summary
            const totalRevenue = orders.reduce(
                (sum, o) => sum + Number(o.totalAmount || 0),
                0,
            );
            const uniqueCustomers = new Set(
                orders.map((o) => o.customerId).filter(Boolean),
            );

            // Top customers
            const customerMap = new Map<
                string,
                { name: string; revenue: number; orders: number }
            >();
            for (const order of orders) {
                const name = order.customer?.name || '-';
                const existing = customerMap.get(name) || {
                    name,
                    revenue: 0,
                    orders: 0,
                };
                existing.revenue += Number(order.totalAmount || 0);
                existing.orders += 1;
                customerMap.set(name, existing);
            }
            const topCustomers = Array.from(customerMap.values())
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 10);

            // Top products
            const productMap = new Map<
                string,
                { name: string; revenue: number; quantity: number }
            >();
            for (const order of orders) {
                for (const item of order.items) {
                    const name =
                        item.productVariant?.product?.name ||
                        item.productVariant?.name ||
                        '-';
                    const existing = productMap.get(name) || {
                        name,
                        revenue: 0,
                        quantity: 0,
                    };
                    existing.revenue += Number(item.subtotal);
                    existing.quantity += Number(item.quantity);
                    productMap.set(name, existing);
                }
            }
            const topProducts = Array.from(productMap.values())
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 10);

            // ── bySalesperson aggregation ──
            const salespersonMap = new Map<
                string,
                {
                    userId: string;
                    name: string;
                    revenue: number;
                    orders: number;
                }
            >();
            for (const order of orders) {
                const rep = order.salesRep;
                const userId = rep?.id || '__unattributed__';
                const name = rep?.name || 'Belum ada atribusi';
                const existing = salespersonMap.get(userId) || {
                    userId,
                    name,
                    revenue: 0,
                    orders: 0,
                };
                existing.revenue += Number(order.totalAmount || 0);
                existing.orders += 1;
                salespersonMap.set(userId, existing);
            }

            // Collect all attributed sales rep IDs (skip __unattributed__ for DB queries)
            const attributedUserIds = Array.from(salespersonMap.keys()).filter(
                (id) => id !== '__unattributed__',
            );

            // Portfolio size: active CustomerSalesAssignment per sales (snapshot, not per-period)
            const portfolioCounts: Record<string, number> = {};
            if (attributedUserIds.length > 0) {
                const portfolioRows =
                    await prisma.customerSalesAssignment.groupBy({
                        by: ['userId'],
                        where: {
                            userId: { in: attributedUserIds },
                            unassignedAt: null,
                        },
                        _count: { id: true },
                    });
                for (const row of portfolioRows) {
                    portfolioCounts[row.userId] = row._count.id;
                }
            }

            // Visit count: SalesVisit within the same date filter range
            const visitCounts: Record<string, number> = {};
            if (attributedUserIds.length > 0) {
                const visitWhere: Record<string, unknown> = {
                    userId: { in: attributedUserIds },
                };
                if (filters?.startDate && filters?.endDate) {
                    visitWhere.checkInTime = {
                        gte: filters.startDate,
                        lte: filters.endDate,
                    };
                }
                const visitRows = await prisma.salesVisit.groupBy({
                    by: ['userId'],
                    where: visitWhere,
                    _count: { id: true },
                });
                for (const row of visitRows) {
                    visitCounts[row.userId] = row._count.id;
                }
            }

            const bySalesperson = Array.from(salespersonMap.values())
                .map((sp) => ({
                    ...sp,
                    avgOrderValue: sp.orders > 0 ? sp.revenue / sp.orders : 0,
                    portfolioSize:
                        sp.userId === '__unattributed__'
                            ? 0
                            : portfolioCounts[sp.userId] || 0,
                    visitCount:
                        sp.userId === '__unattributed__'
                            ? 0
                            : visitCounts[sp.userId] || 0,
                }))
                .sort((a, b) => b.revenue - a.revenue);

            const summary: SalesPerformanceSummary = {
                totalRevenue,
                totalOrders: orders.length,
                totalCustomers: uniqueCustomers.size,
                avgOrderValue:
                    orders.length > 0 ? totalRevenue / orders.length : 0,
                topCustomers,
                topProducts,
                bySalesperson,
            };

            return { rows, summary };
        });
    },
);
