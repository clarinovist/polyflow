'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { SalesOrderStatus } from '@prisma/client';
import {
    getFieldSalesScope,
    scopedCustomerWhere,
    scopedSalesOrderWhere,
    scopedInvoiceWhere,
    assertCanAccessFieldCustomer,
    assertCanAccessFieldOrder,
} from '@/services/sales/field-scope';

// ── My scoped customers (default field list) ───────────────────────

export const getMyFieldCustomers = withTenant(
    async function getMyFieldCustomers() {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);
            const where = scopedCustomerWhere(scope);

            const customers = await prisma.customer.findMany({
                where,
                orderBy: { name: 'asc' },
            });
            return serializeData(customers);
        });
    },
);

// ── Search customers (controlled global search) ───────────────────

export const searchFieldCustomers = withTenant(
    async function searchFieldCustomers(query: string) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);
            if (query.length < 2) return [];

            const where = scopedCustomerWhere(scope);
            const results = await prisma.customer.findMany({
                where: {
                    ...where,
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { code: { contains: query, mode: 'insensitive' } },
                        { phone: { contains: query } },
                        { city: { contains: query, mode: 'insensitive' } },
                    ],
                },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    phone: true,
                    city: true,
                    latitude: true,
                    longitude: true,
                    photoUrl: true,
                    isActive: true,
                },
                orderBy: { name: 'asc' },
                take: 50,
            });

            return serializeData(results);
        });
    },
);

// ── My scoped orders ──────────────────────────────────────────────

export const getMyFieldSalesOrders = withTenant(
    async function getMyFieldSalesOrders() {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);
            const where = scopedSalesOrderWhere(scope);

            const orders = await prisma.salesOrder.findMany({
                where: {
                    ...where,
                    customerId: { not: null },
                },
                include: {
                    customer: { select: { name: true } },
                    _count: { select: { items: true } },
                },
                orderBy: { orderDate: 'desc' },
            });

            return serializeData(orders);
        });
    },
);

// ── My scoped order by ID ─────────────────────────────────────────

export const getFieldSalesOrderById = withTenant(
    async function getFieldSalesOrderById(id: string) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);
            await assertCanAccessFieldOrder(scope, id);

            const order = await prisma.salesOrder.findUnique({
                where: { id },
                include: {
                    customer: {
                        select: {
                            id: true,
                            name: true,
                            phone: true,
                            billingAddress: true,
                            latitude: true,
                            longitude: true,
                        },
                    },
                    sourceLocation: true,
                    items: {
                        include: {
                            productVariant: { include: { product: true } },
                        },
                    },
                    deliveryOrders: {
                        include: {
                            items: {
                                include: {
                                    productVariant: {
                                        include: { product: true },
                                    },
                                },
                            },
                        },
                    },
                    createdBy: { select: { name: true } },
                },
            });

            return serializeData(order);
        });
    },
);

// ── My scoped pipeline stats ──────────────────────────────────────

export const getMyFieldPipelineStats = withTenant(
    async function getMyFieldPipelineStats() {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);
            const where = scopedSalesOrderWhere(scope);

            const pipelineStatuses: SalesOrderStatus[] = [
                SalesOrderStatus.QUOTATION,
                SalesOrderStatus.QUOTATION_SENT,
                SalesOrderStatus.DRAFT,
                SalesOrderStatus.CONFIRMED,
                SalesOrderStatus.IN_PRODUCTION,
                SalesOrderStatus.READY_TO_SHIP,
            ];

            const [stats, recentPipeline] = await Promise.all([
                prisma.salesOrder.groupBy({
                    where: {
                        ...where,
                        customerId: { not: null },
                    },
                    by: ['status'],
                    _count: { status: true },
                    _sum: { totalAmount: true },
                }),
                prisma.salesOrder.findMany({
                    where: {
                        ...where,
                        customerId: { not: null },
                        status: { in: pipelineStatuses },
                    },
                    include: {
                        customer: { select: { name: true } },
                    },
                    orderBy: { orderDate: 'desc' },
                    take: 3,
                }),
            ]);

            const sum = (rows: typeof stats) =>
                rows.reduce(
                    (acc, r) => acc + Number(r._sum.totalAmount || 0),
                    0,
                );
            const count = (rows: typeof stats) =>
                rows.reduce((acc, r) => acc + r._count.status, 0);

            const isActive = (s: string) =>
                [
                    'QUOTATION',
                    'QUOTATION_SENT',
                    'DRAFT',
                    'CONFIRMED',
                    'IN_PRODUCTION',
                    'READY_TO_SHIP',
                ].includes(s);
            const isQuotationPhase = (s: string) =>
                ['QUOTATION', 'QUOTATION_SENT'].includes(s);

            const activeRows = stats.filter((s) => isActive(s.status));
            const quotationRows = stats.filter((s) =>
                isQuotationPhase(s.status),
            );

            return {
                activeCount: count(activeRows),
                pipelineAmount: sum(activeRows),
                openQuotationCount: count(quotationRows),
                openQuotationAmount: sum(quotationRows),
                recentPipeline: recentPipeline.map((o) => ({
                    id: o.id,
                    orderNumber: o.orderNumber,
                    customerName: o.customer?.name ?? '-',
                    totalAmount:
                        o.totalAmount != null ? Number(o.totalAmount) : null,
                    status: o.status,
                    orderDate: o.orderDate.toISOString(),
                })),
            };
        });
    },
);

// ── My scoped receivables (enriched) ─────────────────────────────────
// Non-breaking: keeps all existing fields via spread, adds daysOverdue + lastPromise.
// Batch query for PROMISE_TO_PAY latest per invoice (no N+1).

function calcDaysOverdue(
    dueDate: Date | null | undefined,
    invoiceDate: Date,
): number {
    const base = dueDate ?? invoiceDate;
    const msPerDay = 1000 * 3600 * 24;
    return Math.floor((Date.now() - new Date(base).getTime()) / msPerDay);
}

export const getMyFieldReceivables = withTenant(
    async function getMyFieldReceivables() {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);
            const where = scopedInvoiceWhere(scope);

            const invoices = await prisma.invoice.findMany({
                where,
                include: {
                    salesOrder: {
                        select: {
                            orderNumber: true,
                            customer: { select: { name: true } },
                        },
                    },
                },
                orderBy: { dueDate: 'asc' },
            });

            if (invoices.length === 0) return serializeData(invoices);

            const invoiceIds = invoices.map((i: { id: string }) => i.id);

            // Single batch query for latest PROMISE_TO_PAY per invoice (no N+1)
            const lastPromiseByInvoice = new Map<string, unknown>();
            try {
                const promises = await prisma.collectionActivity.findMany({
                    where: {
                        invoiceId: { in: invoiceIds },
                        type: 'PROMISE_TO_PAY',
                    },
                    orderBy: { activityDate: 'desc' },
                });
                // Keep first (latest) per invoice since ordered desc
                for (const p of promises) {
                    if (
                        !lastPromiseByInvoice.has(
                            (p as { invoiceId: string }).invoiceId,
                        )
                    ) {
                        lastPromiseByInvoice.set(
                            (p as { invoiceId: string }).invoiceId,
                            p,
                        );
                    }
                }
            } catch {
                // collectionActivity table may be missing in older env — keep empty map
            }

            const enriched = invoices.map(
                (inv: {
                    id: string;
                    dueDate: Date | null;
                    invoiceDate: Date;
                }) => ({
                    ...inv,
                    daysOverdue: calcDaysOverdue(inv.dueDate, inv.invoiceDate),
                    lastPromise: lastPromiseByInvoice.get(inv.id) ?? null,
                }),
            );

            return serializeData(enriched as unknown as typeof invoices);
        });
    },
);

// ── My compliance stats (route items completed vs assigned) ───────

export const getMyFieldComplianceStats = withTenant(
    async function getMyFieldComplianceStats() {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const routeWhere = scope.isGlobalViewer
                ? {}
                : { routePlan: { userId: scope.actorUserId, date: today } };

            const [assigned, completed, extraCalls] = await Promise.all([
                prisma.salesRoutePlanItem.count({ where: routeWhere }),
                prisma.salesRoutePlanItem.count({
                    where: {
                        ...routeWhere,
                        status: { in: ['COMPLETED', 'VISITING'] },
                    },
                }),
                prisma.salesVisit.count({
                    where: {
                        ...(scope.isGlobalViewer
                            ? {}
                            : { userId: scope.actorUserId }),
                        isExtraCall: true,
                        checkInTime: { gte: today },
                    },
                }),
            ]);

            return {
                assigned,
                completed,
                extraCalls,
                compliance:
                    assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
            };
        });
    },
);

// ── My follow-ups today (quotation phase, scoped) ─────────────────
export const getMyFollowUpsToday = withTenant(
    async function getMyFollowUpsToday() {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);
            const baseWhere = scopedSalesOrderWhere(scope);

            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            const orders = await prisma.salesOrder.findMany({
                where: {
                    ...baseWhere,
                    customerId: { not: null },
                    status: {
                        in: [
                            SalesOrderStatus.QUOTATION,
                            SalesOrderStatus.QUOTATION_SENT,
                        ],
                    },
                    nextFollowUpDate: { not: null, lte: todayEnd },
                },
                include: {
                    customer: { select: { name: true } },
                },
                orderBy: { nextFollowUpDate: 'asc' },
                take: 10,
            });

            return serializeData(
                orders.map((o) => ({
                    id: o.id,
                    orderNumber: o.orderNumber,
                    customerName: o.customer?.name ?? '-',
                    nextFollowUpDate: o.nextFollowUpDate!.toISOString(),
                    isOverdue:
                        o.nextFollowUpDate!.getTime() <
                        new Date(new Date().setHours(0, 0, 0, 0)).getTime(),
                })),
            );
        });
    },
);

// ── Scoped customer by ID (for detail page) ───────────────────────

export const getFieldCustomerById = withTenant(
    async function getFieldCustomerById(id: string) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);
            await assertCanAccessFieldCustomer(scope, id);

            const customer = await prisma.customer.findUnique({
                where: { id },
            });
            return serializeData(customer);
        });
    },
);
