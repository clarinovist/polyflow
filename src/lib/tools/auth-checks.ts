import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { redirect } from 'next/navigation';
import { Role } from '@prisma/client';
import { headers } from 'next/headers';
import { extractSubdomain } from '@/lib/core/tenant';

/**
 * Resolves the tenant DB for the current request (if on a tenant subdomain).
 * Returns a PrismaClient connected to the tenant DB, or null for the main DB.
 */
async function resolveTenantDb() {
    try {
        const reqHeaders = await headers();
        const host = reqHeaders.get('host') || '';
        const subdomain = extractSubdomain(host);
        if (!subdomain) return null;

        const tenant = await prisma.tenant.findUnique({ where: { subdomain } });
        if (!tenant?.dbUrl) return null;

        const { getTenantDb } = await import('@/lib/core/prisma');
        return getTenantDb(tenant.dbUrl);
    } catch {
        return null;
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
        console.error('[requireAuth] No session or user ID, redirecting to /login');
        redirect('/login');
    }

    // Verify user exists in DB to prevent Foreign Key errors (stale sessions)
    // and ensure role is up to date if needed
    // Use tenant-aware DB if available (important for multi-tenant setups)
    const tenantDb = await resolveTenantDb();
    console.log(`[requireAuth] tenantDb=${tenantDb ? 'TENANT' : 'MAIN'}, userId=${session.user.id}`);
    const user = await (tenantDb || prisma).user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true }
    });

    if (!user) {
        // Stale session, force logout via client-side page
        console.error(`[requireAuth] User ${session.user.id} NOT FOUND in DB, redirecting to /logout`);
        redirect('/logout');
    }

    console.log(`[requireAuth] User ${session.user.id} found, role=${user.role}`);
    return session;
}

/**
 * Ensures a user is authenticated and has a specific role.
 * Throws an error if not.
 * Admin role is typically allowed for all operations unless strictly specified otherwise.
 */
export async function requireRole(requiredRole: Role | Role[]) {
    const session = await requireAuth();
    const userRole = session.user.role;

    if (!userRole) {
        throw new Error('Unauthorized: User has no role');
    }

    // Admin usually has access to everything
    if (userRole === 'ADMIN') {
        return session;
    }

    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

    if (!roles.includes(userRole as Role)) {
        throw new Error(`Unauthorized: Insufficient permissions. Required: ${roles.join(' or ')}`);
    }

    return session;
}
