'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import {
    requirePurchasingRemittanceCreator,
    requirePurchasingFinance,
} from '@/lib/auth/purchasing-access';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    createPurchaseRemittance as createPurchaseRemittanceService,
    verifyPurchaseRemittance as verifyPurchaseRemittanceService,
    rejectPurchaseRemittance as rejectPurchaseRemittanceService,
    listPurchaseRemittances as listPurchaseRemittancesService,
} from '@/services/purchasing/purchase-remittance-service';
import type {
    PurchaseRemittanceItemInput,
    ListPurchaseRemittancesFilter,
} from '@/services/purchasing/purchase-remittance-service';

/**
 * Create a purchase remittance (procurement/warehouse records a supplier
 * payment they made, e.g. COD at a walk-in receipt).
 * Guard: requirePurchasingRemittanceCreator — userId FORCED from session
 * (cannot claim a payment on behalf of someone else).
 */
export const createPurchaseRemittanceAction = withTenant(
    async function createPurchaseRemittanceAction(input: {
        userId?: string;
        paidAt: Date | string;
        items: PurchaseRemittanceItemInput[];
        notes?: string;
    }) {
        return safeAction(async () => {
            const session = await requirePurchasingRemittanceCreator();
            const userId = session.user.id;

            const paidAt =
                input.paidAt instanceof Date
                    ? input.paidAt
                    : new Date(input.paidAt);

            const record = await createPurchaseRemittanceService({
                userId,
                paidAt,
                items: input.items,
                notes: input.notes,
            });

            return serializeData(record);
        });
    },
);

/**
 * Verify a purchase remittance — finance confirms payment was made and
 * records PurchasePayments (triggers recordSupplierPayment per item).
 * Guard: requirePurchasingFinance (ADMIN|FINANCE only).
 */
export const verifyPurchaseRemittanceAction = withTenant(
    async function verifyPurchaseRemittanceAction(input: {
        remittanceId: string;
        notes?: string;
    }) {
        return safeAction(async () => {
            const session = await requirePurchasingFinance();

            const result = await verifyPurchaseRemittanceService(
                input.remittanceId,
                session.user.id,
                input.notes,
            );

            return serializeData(result);
        });
    },
);

/**
 * Reject a purchase remittance — finance declines the claim.
 * Guard: requirePurchasingFinance. No PurchasePayment is created.
 */
export const rejectPurchaseRemittanceAction = withTenant(
    async function rejectPurchaseRemittanceAction(input: {
        remittanceId: string;
        reason: string;
    }) {
        return safeAction(async () => {
            const session = await requirePurchasingFinance();

            const result = await rejectPurchaseRemittanceService(
                input.remittanceId,
                session.user.id,
                input.reason,
            );

            return serializeData(result);
        });
    },
);

/**
 * List purchase remittances — creator sees only their own submissions.
 * Guard: requirePurchasingRemittanceCreator — userId always forced from
 * session (no "global viewer" concept here; scope stays narrow by design).
 */
export const listPurchaseRemittancesAction = withTenant(
    async function listPurchaseRemittancesAction(
        filters: Omit<ListPurchaseRemittancesFilter, 'userId'> = {},
    ) {
        return safeAction(async () => {
            const session = await requirePurchasingRemittanceCreator();

            const rows = await listPurchaseRemittancesService({
                ...filters,
                userId: session.user.id,
            });
            return serializeData(rows);
        });
    },
);

/**
 * List purchase remittances for the FINANCE verification queue — always
 * unscoped (finance must see every submitter's claims). Guard:
 * requirePurchasingFinance. Deliberately separate from
 * listPurchaseRemittancesAction (same reasoning as the sales-side fix:
 * a creator-role guard would reject a plain FINANCE user outright).
 */
export const listPurchaseRemittancesForVerificationAction = withTenant(
    async function listPurchaseRemittancesForVerificationAction(
        filters: Omit<ListPurchaseRemittancesFilter, 'userId'> = {},
    ) {
        return safeAction(async () => {
            await requirePurchasingFinance();
            const rows = await listPurchaseRemittancesService(filters);
            return serializeData(rows);
        });
    },
);

/**
 * List outstanding PurchaseInvoice for the create-remittance invoice
 * picker. Guard: requirePurchasingRemittanceCreator — deliberately NOT
 * reusing the finance-only getOutstandingPurchaseInvoices (PROCUREMENT
 * only, excludes WAREHOUSE who also needs this for walk-in/COD claims).
 */
export const listOutstandingPurchaseInvoicesAction = withTenant(
    async function listOutstandingPurchaseInvoicesAction() {
        return safeAction(async () => {
            await requirePurchasingRemittanceCreator();

            const invoices = await prisma.purchaseInvoice.findMany({
                where: {
                    status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
                },
                orderBy: { createdAt: 'desc' },
                include: {
                    purchaseOrder: {
                        select: {
                            orderNumber: true,
                            supplier: { select: { name: true } },
                        },
                    },
                },
            });

            const outstanding = invoices.filter(
                (inv) => Number(inv.totalAmount) - Number(inv.paidAmount) > 0,
            );

            return serializeData(outstanding);
        });
    },
);
