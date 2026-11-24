'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { hasAnyRole } from '@/lib/auth/roles';
import {
    requireSalesAccess,
    requireSalesManager,
} from '@/lib/auth/sales-access';
import { requireFinanceMutation } from '@/lib/auth/finance-access';
import { BusinessRuleError, safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { getTenantPrefix } from '@/lib/storage/r2';
import {
    claimIdSchema,
    listClaimsSchema,
    parseClaimInput,
    payClaimSchema,
    rejectClaimSchema,
    type ExpenseClaimActor,
} from '@/lib/sales/expense-claim';
import * as claims from '@/services/sales/expense-claim-service';
import { payClaim } from '@/services/sales/expense-claim-payment';
import * as queries from '@/services/sales/expense-claim-queries';

// Every export here must be an async function: sync exports in 'use server' files fail only at `next build`.

const CLAIM_VIEW_PATHS = [
    '/field/sales/claims',
    '/sales/claims',
    '/finance/reimbursements',
] as const;

async function revalidateClaimViews() {
    for (const path of CLAIM_VIEW_PATHS) revalidatePath(path);
}

/** Actor identity always comes from the session, never from client input. */
function actorOf(session: {
    user: { id: string; role?: string; roles?: string[] };
}): ExpenseClaimActor {
    return {
        id: session.user.id,
        isAdmin: hasAnyRole(session.user, ['ADMIN']),
    };
}

// ── Sales (claim owner) ──

export const submitExpenseClaim = withTenant(async function submitExpenseClaim(
    input: unknown,
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const tenant = await getTenantPrefix();
        const claim = await claims.submitClaim(session.user.id, input, {
            tenant,
        });
        await revalidateClaimViews();
        return serializeData(claim);
    });
});

export const cancelExpenseClaim = withTenant(async function cancelExpenseClaim(
    claimId: string,
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const id = parseClaimInput(claimIdSchema, claimId);
        const claim = await claims.cancelClaim(id, session.user.id);
        await revalidateClaimViews();
        return serializeData(claim);
    });
});

export const listMyExpenseClaims = withTenant(
    async function listMyExpenseClaims(options?: unknown) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const parsed = parseClaimInput(listClaimsSchema, options);
            return serializeData(
                await queries.listMyClaims(session.user.id, parsed),
            );
        });
    },
);

export const getMyExpenseClaim = withTenant(async function getMyExpenseClaim(
    claimId: string,
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const id = parseClaimInput(claimIdSchema, claimId);
        return serializeData(await queries.getMyClaim(session.user.id, id));
    });
});

// ── Approver (ADMIN | MARKETING) ──

export const approveExpenseClaim = withTenant(
    async function approveExpenseClaim(claimId: string) {
        return safeAction(async () => {
            const session = await requireSalesManager();
            const id = parseClaimInput(claimIdSchema, claimId);
            const claim = await claims.approveClaim(id, actorOf(session));
            await revalidateClaimViews();
            return serializeData(claim);
        });
    },
);

export const rejectExpenseClaim = withTenant(async function rejectExpenseClaim(
    claimId: string,
    reason: string,
) {
    return safeAction(async () => {
        const session = await requireSalesManager();
        const input = parseClaimInput(rejectClaimSchema, { claimId, reason });
        const claim = await claims.rejectClaim(
            input.claimId,
            actorOf(session),
            input.reason,
        );
        await revalidateClaimViews();
        return serializeData(claim);
    });
});

export const listExpenseClaimsForReview = withTenant(
    async function listExpenseClaimsForReview(options?: unknown) {
        return safeAction(async () => {
            await requireSalesManager();
            const parsed = parseClaimInput(listClaimsSchema, options);
            return serializeData(await queries.listClaimsForReview(parsed));
        });
    },
);

// ── Finance ──

export const payExpenseClaim = withTenant(async function payExpenseClaim(
    input: unknown,
) {
    return safeAction(async () => {
        const session = await requireFinanceMutation();
        const { claimId, ...accounts } = parseClaimInput(payClaimSchema, input);
        const claim = await payClaim(
            claimId,
            { id: session.user.id },
            accounts,
        );
        await revalidateClaimViews();
        return serializeData(claim);
    });
});

export const listExpenseClaimsForPayment = withTenant(
    async function listExpenseClaimsForPayment(options?: unknown) {
        return safeAction(async () => {
            await requireFinanceMutation();
            const parsed = parseClaimInput(listClaimsSchema, options);
            return serializeData(await queries.listClaimsForPayment(parsed));
        });
    },
);

// ── Page counters (approver or Finance) ──

export const getExpenseClaimCounts = withTenant(
    async function getExpenseClaimCounts() {
        return safeAction(async () => {
            const session = await requireAuth();
            if (!hasAnyRole(session.user, ['ADMIN', 'MARKETING', 'FINANCE'])) {
                throw new BusinessRuleError(
                    'Unauthorized: Hanya admin, marketing, atau finance yang dapat melihat antrean klaim.',
                );
            }
            return queries.getClaimsSummaryCounts();
        });
    },
);
