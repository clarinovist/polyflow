import { hasAnyRole, type RoleBearer } from '@/lib/auth/roles';

/** Read + export of HRD financial data (payroll, loans, BPJS, attendance). */
export const HRD_FINANCE_ROLES: readonly string[] = ['ADMIN', 'FINANCE', 'HRD'];

/** Sensitive HR records (leave, disciplinary): decision makers only. */
export const HRD_APPROVER_ROLES: readonly string[] = ['ADMIN', 'HRD'];

const FORBIDDEN_STATUS = 403;

/**
 * Returns a 403 Response when the user lacks every allowed role, otherwise
 * null. Call after the module guard and the session (401) check.
 */
export function denyUnlessRoles(
    user: RoleBearer,
    roles: readonly string[],
): Response | null {
    if (hasAnyRole(user, [...roles])) return null;
    return new Response('Forbidden', { status: FORBIDDEN_STATUS });
}
