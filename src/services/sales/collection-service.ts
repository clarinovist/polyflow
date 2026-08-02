import { prisma } from '@/lib/core/prisma';
import { ValidationError } from '@/lib/errors/errors';
import { InvoiceStatus } from '@prisma/client';
import { getBucket, type AgingBucket } from '../finance/aging-service';

// ── Types ────────────────────────────────────────────────────────────

export interface LogCollectionActivityInput {
    invoiceId: string;
    userId: string;
    type:
        | 'CALL'
        | 'VISIT'
        | 'PROMISE_TO_PAY'
        | 'PARTIAL_COLLECTED'
        | 'DISPUTE'
        | 'UNREACHABLE';
    activityDate?: Date;
    promisedDate?: Date;
    promisedAmount?: number;
    outcome?: string;
    notes?: string;
    visitId?: string;
}

export interface ListCollectionActivitiesFilter {
    invoiceId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
}

export interface SalesArAgingFilter {
    userId?: string;
    asOf?: Date;
}

export interface SalesArAgingInvoiceDetail {
    invoiceId: string;
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date | null;
    daysOverdue: number;
    outstanding: number;
    status: string;
    bucket: AgingBucket;
    salesRepId: string | null;
    customerId: string | null;
}

export interface SalesArAgingRow {
    salesRepId: string | null;
    salesRepName: string;
    type: 'AR';
    notYetDue: number;
    current: number;
    days31to60: number;
    days61to90: number;
    over90: number;
    total: number;
    invoices: SalesArAgingInvoiceDetail[];
}

// ── Attribution helper (exportable, single place) ───────────────────
// Purpose: resolve who should collect an invoice NOW (not who earned commission historically).
// Rule: Invoice → SalesOrder.salesRepId, fallback → CustomerSalesAssignment active (unassignedAt null).
// Used by getSalesArAging; kept exportable for reuse in other collection-related reports.
// Do NOT reuse for commission (workstream 04) — different context.

export interface InvoiceSalesAttributionSource {
    salesRepId?: string | null;
    customerId?: string | null;
}

/**
 * Pure (sync) resolver: given invoice attribution source and a map of
 * customerId → active sales assignment userId, return resolved salesRepId or null.
 *
 * Exported so it can be unit-tested and reused without DB access.
 */
export function resolveSalesRepIdFromInvoice(
    source: InvoiceSalesAttributionSource,
    customerAssignmentMap: Map<string, string>,
): string | null {
    if (source.salesRepId) return source.salesRepId;
    if (source.customerId) {
        const assigned = customerAssignmentMap.get(source.customerId);
        if (assigned) return assigned;
    }
    return null;
}

/**
 * Build customerId → salesRepId map for active assignments.
 * Picks isPrimary=true first per customer, else first encountered.
 * Exported for testability.
 */
export function buildCustomerAssignmentMap(
    assignments: { customerId: string; userId: string; isPrimary: boolean }[],
): Map<string, string> {
    const primaryMap = new Map<string, string>();
    const fallbackMap = new Map<string, string>();

    for (const a of assignments) {
        if (a.isPrimary) {
            if (!primaryMap.has(a.customerId)) {
                primaryMap.set(a.customerId, a.userId);
            }
        } else {
            if (!fallbackMap.has(a.customerId)) {
                fallbackMap.set(a.customerId, a.userId);
            }
        }
    }

    // Merge: primary wins
    const result = new Map<string, string>(fallbackMap);
    for (const [k, v] of primaryMap) {
        result.set(k, v);
    }
    return result;
}

// ── Service ──────────────────────────────────────────────────────────

export class CollectionService {
    /**
     * Log a collection activity / promise-to-pay.
     * Q3 decision: does NOT change InvoiceStatus.
     */
    static async logCollectionActivity(input: LogCollectionActivityInput) {
        if (input.type === 'PROMISE_TO_PAY') {
            if (!input.promisedDate) {
                throw new ValidationError(
                    'promisedDate wajib diisi untuk PROMISE_TO_PAY',
                );
            }
            if (input.promisedAmount == null) {
                throw new ValidationError(
                    'promisedAmount wajib diisi untuk PROMISE_TO_PAY',
                );
            }
        }

        const record = await prisma.collectionActivity.create({
            data: {
                invoiceId: input.invoiceId,
                userId: input.userId,
                type: input.type,
                activityDate: input.activityDate ?? new Date(),
                promisedDate: input.promisedDate ?? null,
                promisedAmount: input.promisedAmount ?? null,
                outcome: input.outcome ?? null,
                notes: input.notes ?? null,
                visitId: input.visitId ?? null,
            },
        });

        return record;
    }

    static async listCollectionActivities(
        filter: ListCollectionActivitiesFilter,
    ) {
        const where: Record<string, unknown> = {};

        if (filter.invoiceId) where.invoiceId = filter.invoiceId;
        if (filter.userId) where.userId = filter.userId;
        if (filter.from || filter.to) {
            const activityDate: Record<string, Date> = {};
            if (filter.from) activityDate.gte = filter.from;
            if (filter.to) activityDate.lte = filter.to;
            where.activityDate = activityDate;
        }

        const rows = await prisma.collectionActivity.findMany({
            where,
            include: {
                invoice: true,
                user: true,
            },
            orderBy: { activityDate: 'desc' },
        });

        return rows;
    }

    /**
     * AR Aging with sales dimension.
     * - Reuses bucket logic from aging-service (getBucket import)
     * - Attribution: SO.salesRepId → fallback CustomerSalesAssignment active
     * - Buckets based on asOf (default now) vs dueDate/invoiceDate
     * - If filter.userId given, only returns that rep + unattributed is excluded unless userId===null logic not matched.
     *   Actually: filters final rows to that userId, but keeps unattributed out unless userId is null (which we don't allow).
     */
    static async getSalesArAging(
        filter: SalesArAgingFilter = {},
    ): Promise<SalesArAgingRow[]> {
        const asOf = filter.asOf ?? new Date();
        const asOfMs = asOf.getTime();

        const invoices = await prisma.invoice.findMany({
            where: {
                status: {
                    in: [
                        InvoiceStatus.UNPAID,
                        InvoiceStatus.PARTIAL,
                        InvoiceStatus.OVERDUE,
                    ],
                },
            },
            include: {
                salesOrder: {
                    select: {
                        salesRepId: true,
                        customerId: true,
                    },
                },
            },
            orderBy: { invoiceDate: 'asc' },
        });

        // Collect customerIds that need fallback lookup (SO.salesRepId null)
        const customerIdsNeedingFallback = new Set<string>();
        for (const inv of invoices) {
            if (!inv.salesOrder?.salesRepId) {
                const cid = inv.salesOrder?.customerId;
                if (cid) customerIdsNeedingFallback.add(cid);
            }
        }

        let assignmentMap = new Map<string, string>();
        if (customerIdsNeedingFallback.size > 0) {
            const assignments = await prisma.customerSalesAssignment.findMany({
                where: {
                    customerId: { in: Array.from(customerIdsNeedingFallback) },
                    unassignedAt: null,
                },
                select: {
                    customerId: true,
                    userId: true,
                    isPrimary: true,
                },
            });
            assignmentMap = buildCustomerAssignmentMap(assignments);
        }

        // Collect unique salesRepIds to fetch names (including from assignment map)
        const allRepIds = new Set<string>();
        for (const inv of invoices) {
            const resolved = resolveSalesRepIdFromInvoice(
                {
                    salesRepId: inv.salesOrder?.salesRepId ?? null,
                    customerId: inv.salesOrder?.customerId ?? null,
                },
                assignmentMap,
            );
            if (resolved) allRepIds.add(resolved);
        }

        let userNameMap = new Map<string, string>();
        if (allRepIds.size > 0) {
            const users = await prisma.user.findMany({
                where: { id: { in: Array.from(allRepIds) } },
                select: { id: true, name: true },
            });
            userNameMap = new Map(users.map((u) => [u.id, u.name ?? u.id]));
        }

        const rowByKey = new Map<string, SalesArAgingRow>();

        for (const inv of invoices) {
            const outstanding =
                inv.totalAmount.toNumber() - inv.paidAmount.toNumber();
            if (outstanding <= 0) continue;

            const resolvedRepId = resolveSalesRepIdFromInvoice(
                {
                    salesRepId: inv.salesOrder?.salesRepId ?? null,
                    customerId: inv.salesOrder?.customerId ?? null,
                },
                assignmentMap,
            );

            // If filter.userId given, skip non-matching (including unattributed)
            if (filter.userId) {
                if (resolvedRepId !== filter.userId) continue;
            }

            const baseDate = inv.dueDate || inv.invoiceDate;
            const daysOverdue = Math.floor(
                (asOfMs - baseDate.getTime()) / (1000 * 3600 * 24),
            );
            const bucket = getBucket(daysOverdue);

            const key = resolvedRepId ?? '__UNATTRIBUTED__';
            if (!rowByKey.has(key)) {
                rowByKey.set(key, {
                    salesRepId: resolvedRepId,
                    salesRepName: resolvedRepId
                        ? (userNameMap.get(resolvedRepId) ?? resolvedRepId)
                        : 'Unattributed',
                    type: 'AR',
                    notYetDue: 0,
                    current: 0,
                    days31to60: 0,
                    days61to90: 0,
                    over90: 0,
                    total: 0,
                    invoices: [],
                });
            }

            const row = rowByKey.get(key)!;

            if (daysOverdue < 0) row.notYetDue += outstanding;
            else if (daysOverdue <= 30) row.current += outstanding;
            else if (daysOverdue <= 60) row.days31to60 += outstanding;
            else if (daysOverdue <= 90) row.days61to90 += outstanding;
            else row.over90 += outstanding;

            row.total += outstanding;
            row.invoices.push({
                invoiceId: inv.id,
                invoiceNumber: inv.invoiceNumber,
                invoiceDate: inv.invoiceDate,
                dueDate: inv.dueDate,
                daysOverdue,
                outstanding,
                status: inv.status,
                bucket,
                salesRepId: resolvedRepId,
                customerId: inv.salesOrder?.customerId ?? null,
            });
        }

        return Array.from(rowByKey.values()).sort((a, b) => b.total - a.total);
    }

    /**
     * Invoices that are UNPAID/OVERDUE/PARTIAL with zero collection activity ever.
     * Most actionable — never been followed up.
     * Optional asOf for scoping date context; userId for sales scoping (same pattern as getSalesArAging).
     */
    static async getInvoicesWithoutCollectionActivity(
        filter: SalesArAgingFilter = {},
    ) {
        const asOf = filter.asOf ?? new Date();
        const asOfMs = asOf.getTime();

        // Reuse same AR statuses as aging
        const invoices = await prisma.invoice.findMany({
            where: {
                status: {
                    in: [
                        InvoiceStatus.UNPAID,
                        InvoiceStatus.PARTIAL,
                        InvoiceStatus.OVERDUE,
                    ],
                },
                collectionActivities: { none: {} },
            },
            include: {
                salesOrder: {
                    select: {
                        salesRepId: true,
                        customerId: true,
                        customer: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { dueDate: 'asc' },
        });

        // Apply fallback assignment for salesRepId resolution when needed (same rule as aging)
        const customerIdsNeedingFallback = new Set<string>();
        for (const inv of invoices) {
            if (!inv.salesOrder?.salesRepId) {
                const cid = inv.salesOrder?.customerId;
                if (cid) customerIdsNeedingFallback.add(cid);
            }
        }

        let assignmentMap = new Map<string, string>();
        if (customerIdsNeedingFallback.size > 0) {
            const assignments = await prisma.customerSalesAssignment.findMany({
                where: {
                    customerId: { in: Array.from(customerIdsNeedingFallback) },
                    unassignedAt: null,
                },
                select: { customerId: true, userId: true, isPrimary: true },
            });
            assignmentMap = buildCustomerAssignmentMap(assignments);
        }

        const rows = invoices
            .map((inv) => {
                const outstanding =
                    inv.totalAmount.toNumber() - inv.paidAmount.toNumber();
                if (outstanding <= 0) return null;
                const resolvedRepId = resolveSalesRepIdFromInvoice(
                    {
                        salesRepId: inv.salesOrder?.salesRepId ?? null,
                        customerId: inv.salesOrder?.customerId ?? null,
                    },
                    assignmentMap,
                );
                if (filter.userId && resolvedRepId !== filter.userId)
                    return null;
                const baseDate = inv.dueDate || inv.invoiceDate;
                const daysOverdue = Math.floor(
                    (asOfMs - baseDate.getTime()) / (1000 * 3600 * 24),
                );
                return {
                    invoiceId: inv.id,
                    invoiceNumber: inv.invoiceNumber,
                    invoiceDate: inv.invoiceDate,
                    dueDate: inv.dueDate,
                    daysOverdue,
                    bucket: getBucket(daysOverdue),
                    outstanding,
                    status: inv.status,
                    salesRepId: resolvedRepId,
                    customerId: inv.salesOrder?.customerId ?? null,
                    customerName: inv.salesOrder?.customer?.name ?? null,
                };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null)
            .sort((a, b) => b.daysOverdue - a.daysOverdue);

        return rows;
    }

    /**
     * Get promise-to-pay activities past promisedDate where invoice not yet PAID/CANCELLED.
     */
    static async getOverduePromises(asOf?: Date) {
        const cutoff = asOf ?? new Date();

        const rows = await prisma.collectionActivity.findMany({
            where: {
                type: 'PROMISE_TO_PAY',
                promisedDate: { lt: cutoff },
                invoice: {
                    status: {
                        notIn: [InvoiceStatus.PAID, InvoiceStatus.CANCELLED],
                    },
                },
            },
            include: {
                invoice: true,
                user: true,
            },
            orderBy: { promisedDate: 'asc' },
        });

        return rows;
    }
}
