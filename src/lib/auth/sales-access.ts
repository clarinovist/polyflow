'use server';

/**
 * Sales access control helpers (Gelombang A — A0).
 *
 * Role mapping:
 * - ADMIN    → full access (cancel SO, force ops)
 * - SALES    → create/list/confirm SO, read invoices
 * - FINANCE  → read-only + invoice side actions (optional)
 *
 * Usage:
 *   const session = await requireSalesAccess();   // ADMIN | SALES
 *   const session = await requireSalesApprover();  // ADMIN only (cancel, destructive)
 *   const session = await requireSalesFinance();   // ADMIN | FINANCE
 */

import { requireAuth } from '@/lib/tools/auth-checks';
import { hasAnyRole } from '@/lib/auth/roles';
import { BusinessRuleError } from '@/lib/errors/errors';

/** ADMIN or SALES — for create/edit/confirm/list actions. */
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
