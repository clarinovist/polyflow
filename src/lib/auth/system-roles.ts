import { Role } from '@prisma/client';

export interface SystemRole {
    value: Role;
    label: string;
    /** Whether this role appears in the Access Control matrix columns */
    matrix: boolean;
}

export const SYSTEM_ROLES: SystemRole[] = [
    { value: 'ADMIN', label: 'Admin', matrix: false },
    { value: 'WAREHOUSE', label: 'Gudang', matrix: true },
    {
        value: 'PRODUCTION',
        label: 'Produksi (lantai)',
        matrix: true,
    },
    { value: 'PLANNING', label: 'Planning (PPIC)', matrix: true },
    { value: 'SALES', label: 'Sales', matrix: true },
    { value: 'MARKETING', label: 'Marketing', matrix: true },
    { value: 'FINANCE', label: 'Finance', matrix: true },
    { value: 'PROCUREMENT', label: 'Purchasing', matrix: true },
    { value: 'HRD', label: 'HRD', matrix: true },
] as const;

/** Roles that appear in the Access Control matrix (non-admin). */
export const MATRIX_ROLES: Role[] = SYSTEM_ROLES.filter((r) => r.matrix).map(
    (r) => r.value,
);

/** Lookup label by role value. */
export function getRoleLabel(role: Role | string): string {
    return SYSTEM_ROLES.find((r) => r.value === role)?.label ?? role;
}
