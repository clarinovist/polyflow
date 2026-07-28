import { Role } from '@prisma/client';

export type RoleBearer =
    | {
          role?: string | Role | null;
          roles?: Array<string | Role> | null;
          isSuperAdmin?: boolean;
      }
    | null
    | undefined;

/**
 * Normalizes primary role and assigned roles into a clean, deduplicated, uppercase string array.
 * Always includes primaryRole if present.
 */
export function normalizeUserRoles(
    primaryRole: string | Role | null | undefined,
    assignedRoles?: Array<string | Role> | null,
): string[] {
    const rolesSet = new Set<string>();
    if (primaryRole) {
        rolesSet.add(String(primaryRole).toUpperCase());
    }
    if (assignedRoles) {
        for (const r of assignedRoles) {
            if (r) rolesSet.add(String(r).toUpperCase());
        }
    }
    return Array.from(rolesSet);
}

/** Resolve all assigned roles; fallback to [role] for legacy sessions. */
export function getUserRoles(user: RoleBearer): string[] {
    if (!user) return [];
    return normalizeUserRoles(user.role, user.roles);
}

export function hasAnyRole(
    user: RoleBearer,
    required: Role | Role[] | string | string[],
): boolean {
    const have = getUserRoles(user);
    if (have.includes('ADMIN')) return true;
    const need = (Array.isArray(required) ? required : [required]).map((r) =>
        String(r).toUpperCase(),
    );
    return need.some((r) => have.includes(r));
}

export function hasRole(user: RoleBearer, required: Role | string): boolean {
    return getUserRoles(user).includes(String(required).toUpperCase());
}

export function isTenantAdmin(user: RoleBearer): boolean {
    return hasRole(user, 'ADMIN');
}
