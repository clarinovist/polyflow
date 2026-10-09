'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import {
    getInvoiceRemainingAmount,
    isActionableInvoiceOverdue,
} from '@/lib/finance/payment-terms';
import { buildOperationalSalesReceivableOrderWhere } from '@/lib/sales/operational-receivables';
import { requireSalesAccess } from '@/lib/auth/sales-access';

import { AnalyticsService } from '@/services/analytics/analytics-service';
import { DateRange } from '@/types/analytics';
import { startOfDay, endOfDay } from 'date-fns';
import type { Prisma } from '@prisma/client';
import { getTopCustomerCreditRisks } from '@/services/sales/credit-service';

export const getSalesDashboardStats = withTenant(
    async function getSalesDashboardStats(dateRange?: DateRange) {
        return safeAction(async () => {
            await requireSalesAccess();

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
                activeOrdersCount,
                activeCustomersCount,
            ] = await Promise.all([
                prisma.salesOrder.count({ where: { status: 'DRAFT' } }),
                prisma.salesOrder.count({ where: { status: 'READY_TO_SHIP' } }),
                prisma.deliveryOrder.count({
                    where: { status: { in: ['PENDING', 'LOADING'] } },
                }),
                prisma.deliveryScheduleVehicle.count({
                    where: {
                        departureDate: { gte: todayStart, lte: todayEnd },
                        status: { notIn: ['CANCELLED'] },
                    },
                }),
                prisma.salesOrder.count({
                    where: {
                        status: {
                            notIn: [
                                'DELIVERED',
                                'CANCELLED',
                                'QUOTATION',
                                'QUOTATION_SENT',
                                'QUOTATION_REJECTED',
                                'QUOTATION_EXPIRED',
                            ],
                        },
                    },
                }),
                prisma.customer.count({ where: { isActive: true } }),
            ]);

            // 3f. Follow-ups due today or overdue (quotation phase only) — top 5
            const followUpsDueRaw = await prisma.salesOrder.findMany({
                take: 5,
                where: {
                    status: { in: ['QUOTATION', 'QUOTATION_SENT'] },
                    nextFollowUpDate: { not: null, lte: todayEnd },
                },
                orderBy: { nextFollowUpDate: 'asc' },
                select: {
                    id: true,
                    orderNumber: true,
                    nextFollowUpDate: true,
                    customer: { select: { name: true } },
                },
            });

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

            // 3b. READY_TO_SHIP without an open DO: filter the full eligible
            // population in SQL, then take the globally oldest five.
            const readyWithoutDoWhere: Prisma.SalesOrderWhereInput = {
                status: 'READY_TO_SHIP',
                deliveryOrders: {
                    none: { status: { in: ['PENDING', 'LOADING'] } },
                },
            };
            const [readyWithoutDoCount, readyWithoutDoRaw] = await Promise.all([
                prisma.salesOrder.count({ where: readyWithoutDoWhere }),
                prisma.salesOrder.findMany({
                    take: 5,
                    where: readyWithoutDoWhere,
                    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                    select: {
                        id: true,
                        orderNumber: true,
                        customer: { select: { name: true } },
                    },
                }),
            ]);

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

            // 3d. Overdue invoices — actionable outstanding only
            const overdueInvoicesRaw = await prisma.invoice.findMany({
                where: {
                    status: { in: ['OVERDUE', 'UNPAID', 'PARTIAL'] },
                    dueDate: { lt: todayStart },
                    salesOrder: buildOperationalSalesReceivableOrderWhere(),
                },
                orderBy: { dueDate: 'asc' },
                select: {
                    id: true,
                    invoiceNumber: true,
                    totalAmount: true,
                    paidAmount: true,
                    creditedAmount: true,
                    priceAdjustmentAmount: true,
                    dueDate: true,
                    status: true,
                    salesOrderId: true,
                    salesOrder: {
                        select: {
                            id: true,
                            customer: { select: { name: true } },
                        },
                    },
                },
            });
            const actionableOverdueInvoices = overdueInvoicesRaw.filter(
                (invoice) => isActionableInvoiceOverdue(invoice, now),
            );
            const overdueInvoiceCount = actionableOverdueInvoices.length;
            const overdueAmount = actionableOverdueInvoices.reduce(
                (sum, invoice) =>
                    sum +
                    getInvoiceRemainingAmount(
                        invoice.totalAmount,
                        invoice.paidAmount,
                        invoice.creditedAmount,
                        invoice.priceAdjustmentAmount,
                    ),
                0,
            );

            // 3e. Credit risk — batch the complete active/limited population
            // and rank globally before taking the top five.
            const creditRiskList = await getTopCustomerCreditRisks(5);

            return serializeData({
                counts: {
                    draftOrders: draftOrdersCount,
                    readyToShipOrders: readyToShipCount,
                    readyWithoutDo: readyWithoutDoCount,
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
                        daysOld: Math.floor(
                            (now.getTime() - new Date(o.createdAt).getTime()) /
                                86400000,
                        ),
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
                    overdueInvoices: actionableOverdueInvoices
                        .slice(0, 5)
                        .map((inv) => ({
                            id: inv.id,
                            invoiceNumber: inv.invoiceNumber,
                            customerName: inv.salesOrder?.customer?.name ?? '-',
                            remaining: getInvoiceRemainingAmount(
                                inv.totalAmount,
                                inv.paidAmount,
                                inv.creditedAmount,
                                inv.priceAdjustmentAmount,
                            ),
                            dueDate: inv.dueDate?.toISOString() ?? '',
                            salesOrderId:
                                inv.salesOrderId ?? inv.salesOrder?.id ?? null,
                        })),
                    creditRisk: creditRiskList,
                    followUpsDue: followUpsDueRaw.map((o) => ({
                        id: o.id,
                        orderNumber: o.orderNumber,
                        customerName: o.customer?.name ?? '-',
                        nextFollowUpDate:
                            o.nextFollowUpDate?.toISOString() ?? '',
                        isOverdue:
                            o.nextFollowUpDate != null &&
                            new Date(o.nextFollowUpDate).getTime() <
                                todayStart.getTime(),
                    })),
                },
                performance: {
                    totalRevenue: analytics.totalRevenue,
                    revenueDefinition: 'journal_4xx' as const,
                    revenueTrend: analytics.revenueTrend,
                    totalOrders: analytics.totalOrders,
                },
            });
        });
    },
);
