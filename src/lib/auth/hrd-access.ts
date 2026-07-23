'use server';

/**
 * HRD access control helpers.
 *
 * Role mapping (plan §3.1 — Opsi A+C):
 * - ADMIN + HRD → pemutus: approve/create/finalize/void
 * - FINANCE + HRD → read-only + mark-paid (via matrix grant)
 *
 * Usage:
 *   const session = await requireHrdApprover();  // admin or hrd
 *   const session = await requireHrdFinance();    // admin, finance, or hrd
 */

import { requireAuth } from '@/lib/tools/auth-checks';
import { hasAnyRole } from '@/lib/auth/roles';
import { BusinessRuleError } from '@/lib/errors/errors';

/** ADMIN or HRD — for create/approve/finalize/void actions (kasbon, payslip, SP, leave approval). */
export async function requireHrdApprover() {
  const session = await requireAuth();
  if (!hasAnyRole(session.user, ['ADMIN', 'HRD'])) {
    throw new BusinessRuleError(
      'Unauthorized: Hanya admin atau HRD yang dapat melakukan aksi ini (approve/finalize/void).',
    );
  }
  return session;
}

/** ADMIN, FINANCE, or HRD — for read + mark-paid actions. */
export async function requireHrdFinance() {
  const session = await requireAuth();
  if (!hasAnyRole(session.user, ['ADMIN', 'FINANCE', 'HRD'])) {
    throw new BusinessRuleError(
      'Unauthorized: Akses HRD finance hanya untuk admin, finance, atau HRD.',
    );
  }
  return session;
}
