import { Role } from '@prisma/client';

export interface SystemRole {
  value: Role;
  label: string;
  /** Whether this role appears in the Access Control matrix columns */
  matrix: boolean;
  /** Whether this role is selectable at login role-selection screen */
  login: boolean;
}

export const SYSTEM_ROLES: SystemRole[] = [
  { value: 'ADMIN', label: 'Admin', matrix: false, login: true },
  { value: 'WAREHOUSE', label: 'Gudang', matrix: true, login: true },
  { value: 'PRODUCTION', label: 'Produksi (lantai)', matrix: true, login: true },
  { value: 'PLANNING', label: 'Planning (PPIC)', matrix: true, login: true },
  { value: 'SALES', label: 'Sales', matrix: true, login: true },
  { value: 'FINANCE', label: 'Finance', matrix: true, login: true },
  { value: 'PROCUREMENT', label: 'Purchasing', matrix: true, login: true },
  { value: 'HRD', label: 'HRD', matrix: true, login: true },
] as const;

/** Roles that appear in the Access Control matrix (non-admin). */
export const MATRIX_ROLES: Role[] = SYSTEM_ROLES
  .filter((r) => r.matrix)
  .map((r) => r.value);

/** Roles that are selectable at login. */
export const LOGIN_ROLES: SystemRole[] = SYSTEM_ROLES.filter((r) => r.login);

/** Lookup label by role value. */
export function getRoleLabel(role: Role | string): string {
  return SYSTEM_ROLES.find((r) => r.value === role)?.label ?? role;
}
