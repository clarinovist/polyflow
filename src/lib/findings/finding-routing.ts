import type { PrismaClient, Role } from '@prisma/client';
import { canSeeFinding } from './finding-access';

const FULL_ACCESS_RESOURCE = 'ALL';

/**
 * Reverse of resolveAllowedResourcesForTenant (@/lib/telegram/permissions):
 * given the resources a Finding requires, return every active user in the
 * tenant who can act on it. Mirrors the app's route guard:
 * - ADMIN (primary or secondary role) and superadmins always qualify;
 * - other roles qualify when one of their RolePermission resources covers a
 *   required resource with prefix semantics (`/finance` → `/finance/invoices`).
 * No PIC mapping table: routing is derived from RolePermission, so it stays
 * correct as staff change roles or leave.
 */
export async function resolveUsersForResources(
    tenantDb: PrismaClient,
    requiredResources: string[],
): Promise<string[]> {
    if (requiredResources.length === 0) return [];

    const permissions = await tenantDb.rolePermission.findMany({
        where: { canAccess: true },
        select: { role: true, resource: true },
    });

    const grantingRoles = new Set<Role>(['ADMIN' as Role]);
    for (const permission of permissions) {
        if (
            permission.resource === FULL_ACCESS_RESOURCE ||
            canSeeFinding([permission.resource], requiredResources)
        ) {
            grantingRoles.add(permission.role);
        }
    }
    const roles = [...grantingRoles];

    const users = await tenantDb.user.findMany({
        where: {
            isActive: true,
            OR: [
                { isSuperAdmin: true },
                { role: { in: roles } },
                { roles: { some: { role: { in: roles } } } },
            ],
        },
        select: { id: true },
    });

    return [...new Set(users.map((u) => u.id))];
}
