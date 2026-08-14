import { prisma } from '@/lib/core/prisma';
import type { PrismaClient, Role } from '@prisma/client';

/**
 * Tenant-scoped resource resolution. Callers running outside ambient
 * tenantContext (cron jobs resolving a tenant directly, e.g. digest-service.ts)
 * MUST use this with their explicit tenantDb — `resolveAllowedResources` below
 * relies on the `prisma` proxy falling back to tenantContext, which is empty
 * in that case and silently resolves against the main DB instead.
 */
export async function resolveAllowedResourcesForTenant(
    tenantDb: PrismaClient,
    userId: string,
): Promise<string[] | 'ALL'> {
    try {
        const user = await tenantDb.user.findUnique({
            where: { id: userId },
            select: { role: true, isSuperAdmin: true },
        });

        if (!user) return [];

        if (user.isSuperAdmin) return 'ALL';

        const roleRows = await tenantDb.userRole.findMany({
            where: { userId },
            select: { role: true },
        });
        const assignedRoles = roleRows.map((r) => r.role as string);
        const allRoles = [...new Set([user.role, ...assignedRoles])].filter(
            Boolean,
        ) as Role[];

        if (allRoles.length === 0) return [];

        const perms = await tenantDb.rolePermission.findMany({
            where: { role: { in: allRoles }, canAccess: true },
            select: { resource: true },
        });

        return [...new Set(perms.map((p) => p.resource))];
    } catch {
        return [];
    }
}

/**
 * Ambient-context variant for request handlers already wrapped in
 * withTenant/withTenantRoute (where the `prisma` proxy correctly routes to
 * the tenant DB). Do NOT call this from cron/background jobs that resolve a
 * tenant directly — use resolveAllowedResourcesForTenant instead.
 */
export async function resolveAllowedResources(
    userId: string,
): Promise<string[] | 'ALL'> {
    return resolveAllowedResourcesForTenant(prisma, userId);
}
