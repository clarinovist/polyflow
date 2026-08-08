'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import { getTargetsForPeriod } from '@/services/sales/target-service';

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

export type SalesPerformanceReportTargetEntry = {
    revenueTarget: number | null;
    achievementPercent: number | null;
    visitTarget: number | null;
    visitAchievementPercent: number | null;
};

export type ProductMixByRegion = {
    region: string;
    productName: string;
    quantity: number;
    revenue: number;
};

export type SalesPerformanceSummary = {
    totalRevenue: number;
    totalOrders: number;
    totalCustomers: number;
    avgOrderValue: number;
    topCustomers: { name: string; revenue: number; orders: number }[];
    topProducts: { name: string; revenue: number; quantity: number }[];
    bySalesperson: ({
        userId: string;
        name: string;
        revenue: number;
        orders: number;
        avgOrderValue: number;
        portfolioSize: number;
        visitCount: number;
    } & SalesPerformanceReportTargetEntry)[];
    productMixByRegion: ProductMixByRegion[];
};

export const getSalesPerformanceReport = withTenant(
    async function getSalesPerformanceReport(filters?: {
        startDate?: Date;
        endDate?: Date;
        customerId?: string;
    }) {
        return safeAction(async () => {
            await requireSalesAccess();

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
                    customer: {
                        select: { name: true, city: true, province: true },
                    },
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

            // ── productMixByRegion aggregation ──
            type RegionProductAcc = {
                quantity: number;
                revenue: number;
            };
            const regionProductMap = new Map<string, RegionProductAcc>();
            for (const order of orders) {
                const region =
                    order.customer?.city ||
                    order.customer?.province ||
                    'Tidak diketahui';
                for (const item of order.items) {
                    const productName =
                        item.productVariant?.product?.name ||
                        item.productVariant?.name ||
                        '-';
                    const key = `${region}::${productName}`;
                    const existing = regionProductMap.get(key);
                    if (existing) {
                        existing.quantity += Number(item.quantity);
                        existing.revenue += Number(item.subtotal);
                    } else {
                        regionProductMap.set(key, {
                            quantity: Number(item.quantity),
                            revenue: Number(item.subtotal),
                        });
                    }
                }
            }
            const productMixByRegion: ProductMixByRegion[] = Array.from(
                regionProductMap.entries(),
            )
                .map(([key, agg]) => {
                    const [region, productName] = key.split('::');
                    return { region, productName, ...agg };
                })
                .sort((a, b) => b.revenue - a.revenue);

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

            // ── target lookup: periode diambil dari startDate bulan,
            // konsisten dengan pattern commission-service ──
            const targetMap = new Map<
                string,
                {
                    revenueTarget: number | null;
                    achievementPercent: number | null;
                    visitTarget: number | null;
                    visitAchievementPercent: number | null;
                }
            >();

            let resolvedYear: number | null = null;
            let resolvedMonth: number | null = null;
            if (filters?.startDate instanceof Date) {
                resolvedYear = filters.startDate.getFullYear();
                resolvedMonth = filters.startDate.getMonth() + 1;
            }

            if (resolvedYear != null && resolvedMonth != null) {
                try {
                    const targetRows = await getTargetsForPeriod(
                        resolvedYear,
                        resolvedMonth,
                    );
                    for (const tr of targetRows) {
                        targetMap.set(tr.userId, {
                            revenueTarget: tr.revenueTarget
                                ? Number(tr.revenueTarget)
                                : null,
                            achievementPercent:
                                tr.revenueAchievementPercent ?? null,
                            visitTarget: tr.visitTarget ?? null,
                            visitAchievementPercent:
                                tr.visitAchievementPercent ?? null,
                        });
                    }
                } catch {
                    // Jangan gagalkan laporan performa kalau target-service error
                }
            }

            const bySalesperson = Array.from(salespersonMap.values())
                .map((sp) => {
                    const tgt = targetMap.get(sp.userId) ?? {
                        revenueTarget: null,
                        achievementPercent: null,
                        visitTarget: null,
                        visitAchievementPercent: null,
                    };
                    return {
                        ...sp,
                        avgOrderValue:
                            sp.orders > 0 ? sp.revenue / sp.orders : 0,
                        portfolioSize:
                            sp.userId === '__unattributed__'
                                ? 0
                                : portfolioCounts[sp.userId] || 0,
                        visitCount:
                            sp.userId === '__unattributed__'
                                ? 0
                                : visitCounts[sp.userId] || 0,
                        ...tgt,
                    };
                })
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
                productMixByRegion,
            };

            return { rows, summary };
        });
    },
);
