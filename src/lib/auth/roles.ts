import { Role } from "@prisma/client";

export type RoleBearer = {
  role?: string | Role | null;
  roles?: Array<string | Role> | null;
  isSuperAdmin?: boolean;
} | null | undefined;

/** Resolve all assigned roles; fallback to [role] for legacy sessions. */
export function getUserRoles(user: RoleBearer): string[] {
  if (!user) return [];
  const primary = user.role ? String(user.role).toUpperCase() : null;
  const fromArray = (user.roles || [])
    .filter(Boolean)
    .map((r) => String(r).toUpperCase());
  if (fromArray.length > 0) return [...new Set(fromArray)];
  return primary ? [primary] : [];
}

export function hasAnyRole(user: RoleBearer, required: Role | Role[] | string | string[]): boolean {
  const have = getUserRoles(user);
  if (have.includes("ADMIN")) return true;
  const need = (Array.isArray(required) ? required : [required]).map((r) =>
    String(r).toUpperCase(),
  );
  return need.some((r) => have.includes(r));
}

export function hasRole(user: RoleBearer, required: Role | string): boolean {
  return getUserRoles(user).includes(String(required).toUpperCase());
}

export function isTenantAdmin(user: RoleBearer): boolean {
  return hasRole(user, "ADMIN");
}
