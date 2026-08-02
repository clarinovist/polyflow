'use server';

/**
 * Sales access control helpers (Gelombang A — A0).
 *
 * Role mapping:
 * - ADMIN     → full access (cancel SO, force ops)
 * - SALES     → create/list/confirm SO, read invoices
 * - MARKETING → same as SALES + assign/unassign customer, verifikasi prospek
 * - FINANCE   → read-only + invoice side actions (optional)
 * - WAREHOUSE → read jadwal kirim & daftar muatan via requireDeliveryAccess()
 *
 * Usage:
 *   const session = await requireSalesAccess();     // ADMIN | SALES | MARKETING
 *   const session = await requireSalesApprover();    // ADMIN only (cancel, destructive)
 *   const session = await requireSalesFinance();     // ADMIN | FINANCE
 *   const session = await requireSalesManager();     // ADMIN | MARKETING
 *   const session = await requireDeliveryAccess();   // ADMIN | SALES | MARKETING | WAREHOUSE
 */

import { requireAuth } from '@/lib/tools/auth-checks';
import { hasAnyRole } from '@/lib/auth/roles';
import { BusinessRuleError } from '@/lib/errors/errors';

/** ADMIN, SALES, or MARKETING — for create/edit/confirm/list actions. */
export async function requireSalesAccess() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'SALES', 'MARKETING'])) {
        throw new BusinessRuleError(
            'Unauthorized: Akses sales hanya untuk admin atau sales.',
        );
    }
    return session;
}

/** ADMIN-only — for cancel SO, force ops, destructive actions. */
export async function requireSalesApprover() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN'])) {
        throw new BusinessRuleError(
            'Unauthorized: Hanya admin yang dapat melakukan aksi ini (cancel order, force ops).',
        );
    }
    return session;
}

/** ADMIN or FINANCE — for invoice side actions, AR visibility. */
export async function requireSalesFinance() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE'])) {
        throw new BusinessRuleError(
            'Unauthorized: Akses finance sales hanya untuk admin atau finance.',
        );
    }
    return session;
}

/** ADMIN or MARKETING — for assign/unassign customer, verifikasi prospek. */
export async function requireSalesManager() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'MARKETING'])) {
        throw new BusinessRuleError(
            'Unauthorized: Hanya admin atau marketing yang dapat melakukan aksi ini.',
        );
    }
    return session;
}

/** ADMIN, SALES, MARKETING, or WAREHOUSE — read jadwal kirim & daftar muatan. */
export async function requireDeliveryAccess() {
    const session = await requireAuth();
    if (
        !hasAnyRole(session.user, ['ADMIN', 'SALES', 'MARKETING', 'WAREHOUSE'])
    ) {
        throw new BusinessRuleError(
            'Unauthorized: Akses jadwal kirim hanya untuk admin, sales, marketing, atau gudang.',
        );
    }
    return session;
}
