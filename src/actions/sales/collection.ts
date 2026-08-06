'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import {
    requireSalesAccess,
    requireSalesFinance,
} from '@/lib/auth/sales-access';
import { safeAction, NotFoundError } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    getFieldSalesScope,
    scopedInvoiceWhere,
} from '@/services/sales/field-scope';
import { CollectionService } from '@/services/sales/collection-service';
import type {
    LogCollectionActivityInput,
    ListCollectionActivitiesFilter,
} from '@/services/sales/collection-service';
import {
    createRemittance as createRemittanceService,
    verifyRemittance as verifyRemittanceService,
    rejectRemittance as rejectRemittanceService,
    listRemittances as listRemittancesService,
    getRemittanceById,
} from '@/services/sales/remittance-service';
import type {
    RemittanceItemInput,
    ListRemittancesFilter,
} from '@/services/sales/remittance-service';

// ── Helpers ────────────────────────────────────────────────────────

type SessionUser = { id: string; role?: string | null; roles?: unknown };

async function assertInvoiceInScope(
    session: { user: SessionUser },
    invoiceId: string,
): Promise<void> {
    const scope = getFieldSalesScope(session as never);
    if (scope.isGlobalViewer) return;
    const where = scopedInvoiceWhere(scope);
    const count = await prisma.invoice.count({
        where: { id: invoiceId, ...where },
    });
    if (count === 0) {
        throw new NotFoundError('Invoice', invoiceId);
    }
}

// ── Actions ────────────────────────────────────────────────────────

/**
 * Log a collection activity. SALES scoped to own invoices; ADMIN/MARKETING global.
 */
export const logCollectionActivityAction = withTenant(
    async function logCollectionActivityAction(
        input: Omit<LogCollectionActivityInput, 'userId'>,
    ) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            await assertInvoiceInScope(
                session as { user: SessionUser },
                input.invoiceId,
            );

            const record = await CollectionService.logCollectionActivity({
                ...input,
                userId: session.user.id,
            });
            return serializeData(record);
        });
    },
);

export const listCollectionActivitiesAction = withTenant(
    async function listCollectionActivitiesAction(
        filters: ListCollectionActivitiesFilter = {},
    ) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session as never);

            // SALES: restrict to invoices in scope
            if (!scope.isGlobalViewer) {
                const invoiceWhere = scopedInvoiceWhere(scope);
                const scopedInvoiceIds = await prisma.invoice.findMany({
                    where: invoiceWhere,
                    select: { id: true },
                });
                const allowedIds = new Set(
                    scopedInvoiceIds.map((r: { id: string }) => r.id),
                );

                // If caller asks for specific invoiceId outside scope → NotFound
                if (filters.invoiceId) {
                    if (!allowedIds.has(filters.invoiceId)) {
                        throw new NotFoundError('Invoice', filters.invoiceId);
                    }
                    // pass through as-is (already validated)
                } else {
                    // When no invoiceId filter, we need to limit query.
                    // Approach: if filter empty for SALES, return only scoped invoices activities.
                    // We apply by injecting invoiceId in { in: [...] } if needed.
                    // For current UX SALES always filters by invoiceId from own receivables list,
                    // but we also guard unfiltered calls: if allowed set empty -> return []
                    if (allowedIds.size === 0) return serializeData([]);
                    // If caller provided userId filter different from self, we keep it
                    // but also restrict by invoiceIds. So we query then filter post-DB via promise.
                    // For efficiency, we pass combined filter via service where if no invoiceId.
                    // Implementation: call service with invoiceId list intersection via manual query
                    // to avoid expanding service API. Simplest: fetch activities and filter here.
                    // However to stay efficient, we do one fetch with invoiceId in allowedIds when
                    // no specific invoiceId is given and user didn't specify too narrow filter.
                    // Note: service supports invoiceId string only (single), so for multi we query directly here.
                    if (!filters.invoiceId) {
                        const where: Record<string, unknown> = {};
                        if (filters.userId) where.userId = filters.userId;
                        if (filters.from || filters.to) {
                            const activityDate: Record<string, Date> = {};
                            if (filters.from) activityDate.gte = filters.from;
                            if (filters.to) activityDate.lte = filters.to;
                            where.activityDate = activityDate;
                        }
                        where.invoiceId = {
                            in: Array.from(allowedIds),
                        };
                        const rows = await prisma.collectionActivity.findMany({
                            where,
                            include: { invoice: true, user: true },
                            orderBy: { activityDate: 'desc' },
                        });
                        return serializeData(rows);
                    }
                }
            }

            // Global viewer OR specific invoice validated
            const rows =
                await CollectionService.listCollectionActivities(filters);
            return serializeData(rows);
        });
    },
);

export const getMyOverduePromisesAction = withTenant(
    async function getMyOverduePromisesAction() {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session as never);
            const asOf = new Date();
            const all = await CollectionService.getOverduePromises(asOf);

            if (scope.isGlobalViewer) {
                return serializeData(all);
            }

            // SALES: filter to actor userId
            const mine = all.filter(
                (r: { userId: string }) => r.userId === scope.actorUserId,
            );
            return serializeData(mine);
        });
    },
);

export const getSalesArAgingAction = withTenant(
    async function getSalesArAgingAction(filters?: {
        userId?: string;
        asOf?: Date;
    }) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session as never);
            const finalFilters: { userId?: string; asOf?: Date } = {
                ...filters,
            };
            // SALES non-global: force own userId, ignore caller-provided userId
            if (!scope.isGlobalViewer) {
                finalFilters.userId = scope.actorUserId;
            }
            const rows = await CollectionService.getSalesArAging(finalFilters);
            return serializeData(rows);
        });
    },
);

export const getInvoicesWithoutCollectionActivityAction = withTenant(
    async function getInvoicesWithoutCollectionActivityAction(filters?: {
        asOf?: Date;
        userId?: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session as never);
            const finalFilters: { asOf?: Date; userId?: string } = {
                ...filters,
            };
            if (!scope.isGlobalViewer) {
                finalFilters.userId = scope.actorUserId;
            }
            const rows =
                await CollectionService.getInvoicesWithoutCollectionActivity(
                    finalFilters,
                );
            return serializeData(rows);
        });
    },
);

// ── Remittance actions (Step 4 — Batch 06) ─────────────────────────

/**
 * Create a remittance (sales records incoming cash/transfer/cek).
 * Guard: requireSalesAccess — all sales allowed to record their own collections.
 * userId is FORCED from session — payload userId (if any) from client is ignored.
 */
export const createRemittanceAction = withTenant(
    async function createRemittanceAction(input: {
        // userId in payload is ignored — forced from session (sales cannot create on behalf of others)
        userId?: string;
        collectedAt: Date | string;
        items: RemittanceItemInput[];
        notes?: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const userId = session.user.id;

            const collectedAt =
                input.collectedAt instanceof Date
                    ? input.collectedAt
                    : new Date(input.collectedAt);

            const record = await createRemittanceService({
                userId,
                collectedAt,
                items: input.items,
                notes: input.notes,
            });

            return serializeData(record);
        });
    },
);

/**
 * Verify a remittance — finance confirms cash received and records Payments.
 * Guard: requireSalesFinance (ADMIN|FINANCE only). Role SALES automatically rejected
 * by this guard for ALL remittances (not just own), so no extra "verifier != creator" logic
 * needed — see Gap 8 note in task description.
 */
export const verifyRemittanceAction = withTenant(
    async function verifyRemittanceAction(input: {
        remittanceId: string;
        notes?: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesFinance();

            const result = await verifyRemittanceService(
                input.remittanceId,
                session.user.id,
                input.notes,
            );

            return serializeData(result);
        });
    },
);

/**
 * Reject a remittance — finance declines the setoran.
 * Guard: requireSalesFinance (ADMIN|FINANCE). No Payment is created.
 */
export const rejectRemittanceAction = withTenant(
    async function rejectRemittanceAction(input: {
        remittanceId: string;
        reason: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesFinance();

            const result = await rejectRemittanceService(
                input.remittanceId,
                session.user.id,
                input.reason,
            );

            return serializeData(result);
        });
    },
);

/**
 * List remittances — SALES sees own, ADMIN/FINANCE/MARKETING sees all.
 * Reuses same scoping pattern as other collection actions (field-scope for SALES).
 */
export const listRemittancesAction = withTenant(
    async function listRemittancesAction(filters: ListRemittancesFilter = {}) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session as never);

            const finalFilters: ListRemittancesFilter = { ...filters };

            if (!scope.isGlobalViewer) {
                // SALES: force own userId
                finalFilters.userId = scope.actorUserId;
            }

            const rows = await listRemittancesService(finalFilters);
            return serializeData(rows);
        });
    },
);

export const getRemittanceByIdAction = withTenant(
    async function getRemittanceByIdAction(id: string) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session as never);
            const row = await getRemittanceById(id);

            // SALES non-global: only own remittance
            if (!scope.isGlobalViewer) {
                if ((row as { userId: string }).userId !== scope.actorUserId) {
                    throw new NotFoundError('SalesRemittance', id);
                }
            }

            return serializeData(row);
        });
    },
);

/**
 * List remittances for the FINANCE verification queue — always unscoped
 * (finance must see every submitter's remittances, not just their own).
 * Guard: requireSalesFinance (ADMIN|FINANCE). Deliberately separate from
 * listRemittancesAction, which guards with requireSalesAccess
 * (ADMIN|SALES|MARKETING) and would reject a plain FINANCE user outright.
 */
export const listRemittancesForVerificationAction = withTenant(
    async function listRemittancesForVerificationAction(
        filters: Omit<ListRemittancesFilter, 'userId'> = {},
    ) {
        return safeAction(async () => {
            await requireSalesFinance();
            const rows = await listRemittancesService(filters);
            return serializeData(rows);
        });
    },
);
