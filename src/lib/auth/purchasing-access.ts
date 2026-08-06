'use server';

/**
 * Purchasing access control helpers (P0 hardening).
 *
 * Role mapping (plan §4.2 — Fase A):
 * - ADMIN, PROCUREMENT, PLANNING → read PR/PO/analytics
 * - ADMIN, PROCUREMENT           → approve/reject PR, cancel/delete PO, supplier mutation
 * - ADMIN, FINANCE                → invoice due date, approval invoice, payment
 * - ADMIN, PROCUREMENT, PLANNING, WAREHOUSE, PRODUCTION → create PR (limited)
 * - Warehouse resource guard      → create GR/walk-in receipt (existing pattern)
 * - Cross-portal read             → action-specific exceptions only
 *
 * Usage:
 *   const session = await requirePurchasingAccess();             // ADMIN | PROCUREMENT | PLANNING
 *   const session = await requirePurchasingApprover();           // ADMIN | PROCUREMENT
 *   const session = await requirePurchasingFinance();            // ADMIN | FINANCE
 *   const session = await requirePurchasingRemittanceCreator();  // ADMIN | PROCUREMENT | WAREHOUSE
 */

import { requireAuth } from '@/lib/tools/auth-checks';
import { hasAnyRole } from '@/lib/auth/roles';
import { BusinessRuleError } from '@/lib/errors/errors';

/** ADMIN, PROCUREMENT, PLANNING, WAREHOUSE, or PRODUCTION — create purchase request. */
export async function requirePurchasingCreator() {
    const session = await requireAuth();
    if (
        !hasAnyRole(session.user, [
            'ADMIN',
            'PROCUREMENT',
            'PLANNING',
            'WAREHOUSE',
            'PRODUCTION',
        ])
    ) {
        throw new BusinessRuleError(
            'Unauthorized: Hanya role berikut yang dapat membuat purchase request: ADMIN, PROCUREMENT, PLANNING, WAREHOUSE, PRODUCTION',
        );
    }
    return session;
}

/** ADMIN, PROCUREMENT, or WAREHOUSE — ajukan PurchaseRemittance (bukti bayar supplier). */
export async function requirePurchasingRemittanceCreator() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'PROCUREMENT', 'WAREHOUSE'])) {
        throw new BusinessRuleError(
            'Unauthorized: Hanya admin, procurement, atau warehouse yang dapat mengajukan setoran pembayaran supplier.',
        );
    }
    return session;
}

/** ADMIN, PROCUREMENT, or PLANNING — read PR/PO/analytics, generic purchasing scope. */
export async function requirePurchasingAccess() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'PROCUREMENT', 'PLANNING'])) {
        throw new BusinessRuleError(
            'Unauthorized: Akses purchasing hanya untuk admin, procurement, atau planning.',
        );
    }
    return session;
}

/** ADMIN or PROCUREMENT — approve/reject PR, approve commercial, cancel/delete PO. */
export async function requirePurchasingApprover() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'PROCUREMENT'])) {
        throw new BusinessRuleError(
            'Unauthorized: Hanya admin atau procurement yang dapat melakukan aksi ini.',
        );
    }
    return session;
}

/** ADMIN or FINANCE — invoice due date, approval invoice walk-in, payment. */
export async function requirePurchasingFinance() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE'])) {
        throw new BusinessRuleError(
            'Unauthorized: Akses finance purchasing hanya untuk admin atau finance.',
        );
    }
    return session;
}

/** ADMIN, PROCUREMENT, PLANNING, or FINANCE — read-only analytics (spend, ranking, AP aging). */
export async function requirePurchasingAnalyticsRead() {
    const session = await requireAuth();
    if (
        !hasAnyRole(session.user, [
            'ADMIN',
            'PROCUREMENT',
            'PLANNING',
            'FINANCE',
        ])
    ) {
        throw new BusinessRuleError(
            'Unauthorized: Akses analytics purchasing hanya untuk admin, procurement, planning, atau finance.',
        );
    }
    return session;
}
