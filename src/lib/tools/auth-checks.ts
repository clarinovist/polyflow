import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';
import { headers } from 'next/headers';
import { extractSubdomain } from '@/lib/core/tenant';
import { assertTenantSession } from '@/lib/auth/tenant-session';
import { CentralIdentityService } from '@/services/auth/central-identity-service';
import { AuthorizationError, BusinessRuleError } from '@/lib/errors/errors';
import { getUserRoles, hasAnyRole } from '@/lib/auth/roles';

/**
 * Resolves the tenant DB for the current request (if on a tenant subdomain).
 * Returns a PrismaClient connected to the tenant DB, or null for the main DB.
 */
async function resolveTenantDb() {
    try {
        const reqHeaders = await headers();
        // Try host header, then x-forwarded-host (Docker/nginx)
        let host = reqHeaders.get('host') || '';
        let subdomain = extractSubdomain(host);
        if (!subdomain) {
            const forwardedHost = reqHeaders.get('x-forwarded-host') || '';
            host = forwardedHost;
            subdomain = extractSubdomain(forwardedHost);
        }
        if (!subdomain) return null;

        const { getMainPrisma, getTenantDb } =
            await import('@/lib/core/prisma');
        const mainDb = getMainPrisma();
        const tenant = await mainDb.tenant.findUnique({ where: { subdomain } });
        if (!tenant?.dbUrl) return null;

        return {
            tenantId: tenant.id,
            subdomain,
            tenantDb: getTenantDb(tenant.dbUrl),
            mainDb,
        };
    } catch {
        // A request that names a tenant must never silently fall back to MAIN
        // when registry resolution fails.
        throw new AuthorizationError('Tenant tidak dapat diverifikasi.');
    }
}

/**
 * Ensures a user is authenticated.
 * Redirects to login if not.
 * Tenant-aware: resolves the correct DB from the Host header.
 */
export async function requireAuth() {
    const session = await auth();
    if (!session?.user || !session.user.id) {
        console.error(
            '[requireAuth] No session or user ID, redirecting to /login',
        );
        redirect('/login');
    }

    // Verify user exists in DB to prevent Foreign Key errors (stale sessions)
    // Use tenant-aware DB if available (important for multi-tenant setups)
    const requireLocalBinding =
        process.env.REQUIRE_TENANT_SESSION_BINDING === 'true';
    const needsTenantValidation =
        !!session.user.globalAccountId ||
        !!session.user.tenantId ||
        requireLocalBinding;
    const tenant = needsTenantValidation ? await resolveTenantDb() : null;
    if (tenant) {
        await assertTenantSession(
            session,
            { tenantId: tenant.tenantId, subdomain: tenant.subdomain },
            session.user.globalAccountId
                ? new CentralIdentityService({
                      mainDb: tenant.mainDb,
                      loadTenantDb: async () => tenant.tenantDb,
                  })
                : null,
            { requireLocalBinding },
        );
    }
    const sessionTenantId = (session.user as { tenantId?: string }).tenantId;
    const sessionSubdomain = (session.user as { tenantSubdomain?: string })
        .tenantSubdomain;
    if (!tenant && (sessionTenantId || session.user.globalAccountId)) {
        // Fail closed: this session belongs to a tenant, but the request
        // carries no tenant context (e.g. root/www domain). Never fall back
        // to MAIN and never destroy the session — bounce to login so the
        // user can continue on the right subdomain (Oct 2026, mobile loop).
        console.error(
            '[requireAuth] Tenant-bound session without tenant context, redirecting to /login',
            {
                userId: session.user.id,
                tenantSubdomain: sessionSubdomain ?? null,
            },
        );
        redirect('/login');
    }
    let user = await (tenant?.tenantDb || prisma).user.findUnique({
        where: { id: session.user.id },
        select: { id: true },
    });

    if (!user) {
        // A single lookup miss must never destroy a valid session: under
        // concurrent load a transient misroute can momentarily miss an
        // existing row, and signing out on it traps the user in a
        // login → logout loop they cannot recover from (Oct 2026, mobile).
        // Retry once with a freshly resolved client, and only treat a
        // confirmed miss as a stale session.
        console.error('[requireAuth] User lookup miss, retrying once', {
            userId: session.user.id,
            tenantId: tenant?.tenantId ?? null,
            subdomain: tenant?.subdomain ?? null,
        });
        const retryTenant = needsTenantValidation
            ? await resolveTenantDb()
            : null;
        user = await (retryTenant?.tenantDb || prisma).user.findUnique({
            where: { id: session.user.id },
            select: { id: true },
        });
    }

    if (!user) {
        // Stale session, force logout via client-side page
        console.error(
            '[requireAuth] User lookup confirmed miss, redirecting to /logout',
            {
                userId: session.user.id,
                tenantId: tenant?.tenantId ?? null,
                subdomain: tenant?.subdomain ?? null,
            },
        );
        redirect('/logout');
    }

    return session;
}

/**
 * Ensures a user is authenticated and has a specific role.
 * Throws an error if not.
 * Admin role is typically allowed for all operations unless strictly specified otherwise.
 */
export async function requireRole(requiredRole: Role | Role[]) {
    const session = await requireAuth();
    const userRoles = getUserRoles(session.user);

    if (userRoles.length === 0) {
        throw new AuthorizationError('Unauthorized: User has no role');
    }

    if (!hasAnyRole(session.user, requiredRole)) {
        const roles = Array.isArray(requiredRole)
            ? requiredRole
            : [requiredRole];
        throw new AuthorizationError(
            `Unauthorized: Insufficient permissions. Required: ${roles.join(' or ')}`,
        );
    }

    return session;
}

/**
 * Ensures the current user has Planning or Admin role.
 * Throws BusinessRuleError (suitable for server actions).
 */
export async function requirePlanningRole() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['PLANNING', 'ADMIN'])) {
        throw new BusinessRuleError(
            'Unauthorized: Only Planning can perform this action',
        );
    }

    return session;
}

/**
 * Ensures the current user has Production, Admin, or Planning role.
 * Throws BusinessRuleError (suitable for server actions).
 */
export async function requireProductionLeaderRole() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['ADMIN', 'PRODUCTION', 'PLANNING'])) {
        throw new BusinessRuleError(
            'Unauthorized: Only production leaders or admins can perform this action',
        );
    }

    return session;
}

/**
 * Path A — warehouse-controlled stock (RM issue, ad-hoc pelembab, consolidated pick).
 * ADMIN always allowed via hasAnyRole.
 */
export async function requireWarehouseStockRole() {
    const session = await requireAuth();
    if (!hasAnyRole(session.user, ['WAREHOUSE', 'ADMIN'])) {
        throw new BusinessRuleError(
            'Hanya gudang atau admin yang dapat mengeluarkan bahan baku / mencatat pemakaian ad-hoc dari gudang RM.',
        );
    }
    return session;
}

/**
 * Material issue/transfer by dual-path ownership.
 * - warehouse_rm: WAREHOUSE | ADMIN
 * - floor_wip: PRODUCTION | PLANNING | WAREHOUSE | ADMIN
 */
export async function requireMaterialPathRole(
    path: 'warehouse_rm' | 'floor_wip',
) {
    if (path === 'warehouse_rm') {
        return requireWarehouseStockRole();
    }

    const session = await requireAuth();
    if (
        !hasAnyRole(session.user, [
            'PRODUCTION',
            'PLANNING',
            'WAREHOUSE',
            'ADMIN',
        ])
    ) {
        throw new BusinessRuleError(
            'Tidak diizinkan mentransfer material WIP di lantai produksi.',
        );
    }
    return session;
}

export type WarehouseResourceCapability =
    | { allowed: true }
    | {
          allowed: false;
          reason: 'INACTIVE_OR_MISSING' | 'NO_ROLE' | 'NO_PERMISSION';
      };

/**
 * Resolve access from fresh DB state. Expected denial is data; operational DB
 * failures throw so a caller cannot silently turn an outage into `false`.
 */
export async function resolveWarehouseResourceCapability(
    userId: string,
    resourcePath: string,
): Promise<WarehouseResourceCapability> {
    const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isActive: true },
    });

    if (!dbUser || !dbUser.isActive) {
        return { allowed: false, reason: 'INACTIVE_OR_MISSING' };
    }
    if (dbUser.role === 'ADMIN') return { allowed: true };

    const userRoles = await prisma.userRole.findMany({
        where: { userId },
        select: { role: true },
    });
    const roleNames = Array.from(new Set(userRoles.map((row) => row.role)));
    if (roleNames.length === 0) return { allowed: false, reason: 'NO_ROLE' };

    const permissions = await prisma.rolePermission.findMany({
        where: { role: { in: roleNames }, canAccess: true },
        select: { resource: true },
    });
    const resources = Array.from(
        new Set(permissions.map((permission) => permission.resource)),
    );
    const allowed = resources.some(
        (resource) =>
            resource === 'ALL' ||
            resource === resourcePath ||
            resourcePath.startsWith(`${resource}/`),
    );

    return allowed
        ? { allowed: true }
        : { allowed: false, reason: 'NO_PERMISSION' };
}

/** Expected denials return false; operational failures remain visible. */
export async function canAccessWarehouseResource(resourcePath: string) {
    const session = await requireAuth();
    const capability = await resolveWarehouseResourceCapability(
        session.user.id,
        resourcePath,
    );
    return capability.allowed;
}

/** Mutation guard backed by the same resolver as capability rendering. */
export async function requireWarehouseResourcePermission(resourcePath: string) {
    const session = await requireAuth();
    const capability = await resolveWarehouseResourceCapability(
        session.user.id,
        resourcePath,
    );

    if (!capability.allowed) {
        throw new AuthorizationError(
            capability.reason === 'INACTIVE_OR_MISSING'
                ? 'User account tidak aktif atau tidak ditemukan.'
                : `Anda tidak memiliki izin untuk melakukan operasi ini (${resourcePath}).`,
        );
    }

    return session;
}
