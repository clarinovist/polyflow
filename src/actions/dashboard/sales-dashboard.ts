'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';

import { AnalyticsService } from '@/services/analytics/analytics-service';
import { DateRange } from '@/types/analytics';
import { startOfDay, endOfDay } from 'date-fns';

export const getSalesDashboardStats = withTenant(
async function getSalesDashboardStats(dateRange?: DateRange) {
    return safeAction(async () => {
        const now = new Date();
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);

        // ── 1. Analytics Metrics (revenue, trends — date-bound) ──
        const analytics = await AnalyticsService.getSalesMetrics(dateRange);

        // ── 2. Operational Counts (snapshot now — NOT date-bound) ──
        const [
            draftOrdersCount,
            readyToShipCount,
            openDeliveryCount,
            tripsTodayCount,
            overdueInvoiceCount,
            activeOrdersCount,
            activeCustomersCount,
        ] = await Promise.all([
            prisma.salesOrder.count({ where: { status: 'DRAFT' } }),
            prisma.salesOrder.count({ where: { status: 'READY_TO_SHIP' } }),
            prisma.deliveryOrder.count({ where: { status: { in: ['PENDING', 'LOADING'] } } }),
            prisma.deliveryScheduleVehicle.count({
                where: {
                    departureDate: { gte: todayStart, lte: todayEnd },
                    status: { notIn: ['CANCELLED'] },
                },
            }),
            prisma.invoice.count({
                where: {
                    status: { in: ['OVERDUE', 'UNPAID', 'PARTIAL'] },
                    dueDate: { lt: now },
                },
            }),
            prisma.salesOrder.count({
                where: { status: { notIn: ['DELIVERED', 'CANCELLED'] } },
            }),
            prisma.customer.count({ where: { isActive: true } }),
        ]);

        // Overdue amount sum
        const overdueAgg = await prisma.invoice.aggregate({
            where: {
                status: { in: ['OVERDUE', 'UNPAID', 'PARTIAL'] },
                dueDate: { lt: now },
            },
            _sum: { totalAmount: true, paidAmount: true },
        });
        const overdueAmount =
            (Number(overdueAgg._sum.totalAmount) || 0) -
            (Number(overdueAgg._sum.paidAmount) || 0);

        // ── 3. Attention Lists (top 5 each) ──

        // 3a. Old DRAFT orders (> 0 days old, sorted oldest first)
        const oldDrafts = await prisma.salesOrder.findMany({
            take: 5,
            where: { status: 'DRAFT' },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                orderNumber: true,
                createdAt: true,
                customer: { select: { name: true } },
            },
        });

        // 3b. READY_TO_SHIP without any open DO
        const readySoIds = (
            await prisma.salesOrder.findMany({
                take: 20,
                where: { status: 'READY_TO_SHIP' },
                select: { id: true },
            })
        ).map((s) => s.id);

        const readyWithDo = new Set(
            (
                await prisma.deliveryOrder.findMany({
                    where: {
                        salesOrderId: { in: readySoIds },
                        status: { in: ['PENDING', 'LOADING'] },
                    },
                    select: { salesOrderId: true },
                })
            ).map((d) => d.salesOrderId),
        );

        const readyWithoutDoRaw = await prisma.salesOrder.findMany({
            take: 5,
            where: {
                id: { in: readySoIds.filter((id) => !readyWithDo.has(id)) },
            },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                orderNumber: true,
                customer: { select: { name: true } },
            },
        });

        // 3c. Open deliveries (PENDING + LOADING) — top 5
        const openDeliveries = await prisma.deliveryOrder.findMany({
            take: 5,
            where: { status: { in: ['PENDING', 'LOADING'] } },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                orderNumber: true,
                status: true,
                salesOrder: {
                    select: { customer: { select: { name: true } } },
                },
            },
        });

        // 3d. Overdue invoices — top 5 by remaining amount
        const overdueInvoicesRaw = await prisma.invoice.findMany({
            take: 5,
            where: {
                status: { in: ['OVERDUE', 'UNPAID', 'PARTIAL'] },
                dueDate: { lt: now },
            },
            orderBy: { dueDate: 'asc' },
            select: {
                id: true,
                invoiceNumber: true,
                totalAmount: true,
                paidAmount: true,
                dueDate: true,
                salesOrderId: true,
                salesOrder: {
                    select: { id: true, customer: { select: { name: true } } },
                },
            },
        });

        // 3e. Credit risk — customers with credit limit near/over (top 5)
        const customersWithLimit = await prisma.customer.findMany({
            take: 30,
            where: { isActive: true, creditLimit: { not: null } },
            select: { id: true, name: true, creditLimit: true },
        });

        const creditRiskList: Array<{
            id: string;
            name: string;
            exposureStatus: 'near' | 'over';
            headroom: number;
        }> = [];

        for (const c of customersWithLimit) {
            const limit = Number(c.creditLimit);
            if (limit <= 0) continue;

            const [unpaidAgg, openSoAgg] = await Promise.all([
                prisma.invoice.aggregate({
                    where: {
                        salesOrder: { customerId: c.id },
                        status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                    },
                    _sum: { totalAmount: true, paidAmount: true },
                }),
                prisma.salesOrder.aggregate({
                    where: {
                        customerId: c.id,
                        status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED'] },
                        invoices: { none: {} },
                    },
                    _sum: { totalAmount: true },
                }),
            ]);

            const unpaidBalance =
                (Number(unpaidAgg._sum.totalAmount) || 0) -
                (Number(unpaidAgg._sum.paidAmount) || 0);
            const openSo = Number(openSoAgg._sum.totalAmount) || 0;
            const exposure = unpaidBalance + openSo;
            const headroom = limit - exposure;

            if (exposure > limit) {
                creditRiskList.push({ id: c.id, name: c.name, exposureStatus: 'over', headroom });
            } else if (headroom < limit * 0.1) {
                creditRiskList.push({ id: c.id, name: c.name, exposureStatus: 'near', headroom });
            }

            if (creditRiskList.length >= 5) break;
        }

        return serializeData({
            counts: {
                draftOrders: draftOrdersCount,
                readyToShipOrders: readyToShipCount,
                openDeliveryOrders: openDeliveryCount,
                tripsToday: tripsTodayCount,
                overdueInvoices: overdueInvoiceCount,
                overdueAmount,
                activeOrders: activeOrdersCount,
                activeCustomers: activeCustomersCount,
            },
            attention: {
                oldDrafts: oldDrafts.map((o) => ({
                    id: o.id,
                    orderNumber: o.orderNumber,
                    customerName: o.customer?.name ?? '-',
                    daysOld: Math.floor((now.getTime() - new Date(o.createdAt).getTime()) / 86400000),
                })),
                readyWithoutDo: readyWithoutDoRaw.map((o) => ({
                    id: o.id,
                    orderNumber: o.orderNumber,
                    customerName: o.customer?.name ?? '-',
                })),
                openDeliveries: openDeliveries.map((d) => ({
                    id: d.id,
                    deliveryNumber: d.orderNumber,
                    status: d.status,
                    customerName: d.salesOrder?.customer?.name ?? undefined,
                })),
                overdueInvoices: overdueInvoicesRaw.map((inv) => ({
                    id: inv.id,
                    invoiceNumber: inv.invoiceNumber,
                    customerName: inv.salesOrder?.customer?.name ?? '-',
                    remaining: Number(inv.totalAmount) - Number(inv.paidAmount),
                    dueDate: inv.dueDate?.toISOString() ?? '',
                    salesOrderId: inv.salesOrderId ?? inv.salesOrder?.id ?? null,
                })),
                creditRisk: creditRiskList,
            },
            performance: {
                totalRevenue: analytics.totalRevenue,
                revenueDefinition: 'journal_4xx' as const,
                revenueTrend: analytics.revenueTrend,
                totalOrders: analytics.totalOrders,
            },
        });
    });
}
);
