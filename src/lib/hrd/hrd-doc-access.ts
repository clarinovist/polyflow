/**
 * Role access for HRD documents (`<tenant>/hrd-docs/<category>/...`) and employee
 * attendance selfies (`<tenant>/attendance/...`). Shared by the upload route and the
 * image proxy so the per-category role lists live in one place.
 */

export type HrdDocCategory = 'disciplinary' | 'leave' | 'loan' | 'employee';

/** ADMIN/HRD only — personnel-sensitive documents. */
export const HRD_DOC_APPROVER_ROLES: readonly string[] = ['ADMIN', 'HRD'];

/** ADMIN/FINANCE/HRD — loan documents and attendance selfies. */
export const HRD_DOC_FINANCE_ROLES: readonly string[] = ['ADMIN', 'FINANCE', 'HRD'];

const ROLES_BY_CATEGORY: ReadonlyMap<string, readonly string[]> = new Map([
    ['disciplinary', HRD_DOC_APPROVER_ROLES],
    ['leave', HRD_DOC_APPROVER_ROLES],
    ['employee', HRD_DOC_APPROVER_ROLES],
    ['loan', HRD_DOC_FINANCE_ROLES],
]);

/** Roles allowed for a document category; unknown categories fall back to ADMIN/HRD. */
export function rolesForHrdDocCategory(category: string | undefined): readonly string[] {
    return ROLES_BY_CATEGORY.get((category ?? '').toLowerCase()) ?? HRD_DOC_APPROVER_ROLES;
}
