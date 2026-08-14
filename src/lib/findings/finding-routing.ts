import type { PrismaClient } from '@prisma/client';

/**
 * Reverse of resolveAllowedResourcesForTenant (@/lib/telegram/permissions):
 * given the resources a Finding requires, return every active user in the
 * tenant who can act on it — anyone whose role(s) grant at least one of
 * those resources, plus superadmins regardless of role. No PIC mapping
 * table: routing is derived entirely from RolePermission, so it stays
 * correct as staff change roles or leave.
 */
export async function resolveUsersForResources(
    tenantDb: PrismaClient,
    requiredResources: string[],
): Promise<string[]> {
    if (requiredResources.length === 0) return [];

    const [permittedRoles, superAdmins] = await Promise.all([
        tenantDb.rolePermission.findMany({
            where: { resource: { in: requiredResources }, canAccess: true },
            select: { role: true },
        }),
        tenantDb.user.findMany({
            where: { isSuperAdmin: true, isActive: true },
            select: { id: true },
        }),
    ]);

    const roles = [...new Set(permittedRoles.map((p) => p.role))];

    const roleUsers =
        roles.length === 0
            ? []
            : await tenantDb.user.findMany({
                  where: {
                      isActive: true,
                      OR: [
                          { role: { in: roles } },
                          { roles: { some: { role: { in: roles } } } },
                      ],
                  },
                  select: { id: true },
              });

    const userIds = new Set<string>([
        ...roleUsers.map((u) => u.id),
        ...superAdmins.map((u) => u.id),
    ]);

    return [...userIds];
}
