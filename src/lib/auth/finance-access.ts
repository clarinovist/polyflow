'use server';

/**
 * Finance access control helpers (Workstream 02 — finance-authz).
 *
 * Role mapping:
 * - ADMIN     → full access (all finance operations)
 * - FINANCE   → read + mutation + approver (post/void journal, close period, reconciliation)
 * - Cross-portal read → action-specific; caller menentukan role sempit yang sah
 *
 * Usage:
 *   const session = await requireFinanceAccess();             // ADMIN | FINANCE
 *   const session = await requireFinanceMutation();            // ADMIN | FINANCE (payment, asset, budget, reconciliation mutation)
 *   const session = await requireFinanceApprover();            // ADMIN | FINANCE (post/void/reverse journal, close/reopen period, final reconciliation)
 *   const session = await requireFinanceAdmin();               // ADMIN only (reset COA role mapping)
 *   const session = await requireFinanceReadCrossPortal(roles); // ADMIN | FINANCE | listed roles (narrow cross-portal read)
 */

import { requireAuth } from '@/lib/tools/auth-checks';
import { hasAnyRole } from '@/lib/auth/roles';
import { BusinessRuleError } from '@/lib/errors/errors';

/** ADMIN or FINANCE — for general Finance read access. */
export async function requireFinanceAccess() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE'])) {
        throw new BusinessRuleError(
            'Unauthorized: Akses finance hanya untuk admin atau finance.',
        );
    }
    return session;
}

/** ADMIN or FINANCE — for payment, asset, budget, reconciliation mutation. */
export async function requireFinanceMutation() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE'])) {
        throw new BusinessRuleError(
            'Unauthorized: Mutasi finance hanya untuk admin atau finance.',
        );
    }
    return session;
}

/** ADMIN or FINANCE — for post/void/reverse journal, close/reopen period, final reconciliation. */
export async function requireFinanceApprover() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE'])) {
        throw new BusinessRuleError(
            'Unauthorized: Approver finance hanya untuk admin atau finance.',
        );
    }
    return session;
}

/** ADMIN only — for reset COA role mapping (destructive, admin-only). */
export async function requireFinanceAdmin() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN'])) {
        throw new BusinessRuleError(
            'Unauthorized: Hanya admin yang dapat melakukan aksi ini (reset mapping COA).',
        );
    }
    return session;
}

/**
 * Cross-portal Finance read — for query actions legitimately used by
 * non-Finance portals (e.g. Product master account selector, Sales AR, Purchasing AP).
 *
 * Always allows ADMIN and FINANCE. Additionally allows the specified `allowedRoles`.
 * Throws if the user's role is not in any of the allowed sets.
 */
export async function requireFinanceReadCrossPortal(allowedRoles: string[]) {
    const session = await requireAuth();
    if (
        !hasAnyRole(session.user, [
            'ADMIN',
            'FINANCE',
            ...allowedRoles,
        ])
    ) {
        throw new BusinessRuleError(
            'Unauthorized: Akses baca finance tidak diizinkan untuk role ini.',
        );
    }
    return session;
}
