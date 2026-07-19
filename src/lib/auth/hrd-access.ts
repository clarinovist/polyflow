'use server';

/**
 * HRD access control helpers (Fase 0).
 *
 * Role mapping (per plan §1):
 * - ADMIN  → pemutus: approve/create/finalize/void
 * - FINANCE → read-only + mark-paid
 *
 * Usage:
 *   const session = await requireHrdApprover();  // admin only
 *   const session = await requireHrdFinance();    // admin or finance
 */

import { requireAuth } from '@/lib/tools/auth-checks';
import { hasAnyRole } from '@/lib/auth/roles';
import { BusinessRuleError } from '@/lib/errors/errors';

/** ADMIN-only — for create/approve/finalize/void actions (kasbon, payslip, SP, leave approval). */
export async function requireHrdApprover() {
  const session = await requireAuth();
  if (!hasAnyRole(session.user, ['ADMIN'])) {
    throw new BusinessRuleError(
      'Unauthorized: Hanya admin yang dapat melakukan aksi ini (approve/finalize/void).',
    );
  }
  return session;
}

/** ADMIN or FINANCE — for read + mark-paid actions. */
export async function requireHrdFinance() {
  const session = await requireAuth();
  if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE'])) {
    throw new BusinessRuleError(
      'Unauthorized: Akses HRD finance hanya untuk admin atau finance.',
    );
  }
  return session;
}
