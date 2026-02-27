import { getTenantDb, tenantContext } from '@/lib/prisma';
import { headers } from 'next/headers';

/**
 * Higher Order Function to wrap Next.js Server Actions.
 * It extracts the `x-tenant-subdomain` header (set by our Proxy Middleware),
 * fetches the corresponding Tenant DB URL, and runs the action within an `AsyncLocalStorage` context.
 */
export function withTenant<T extends (...args: any[]) => Promise<any>>(action: T): T {
    return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
        const reqHeaders = await headers();
        let subdomain = reqHeaders.get('x-tenant-subdomain');

        // Fallback: If Proxy Middleware doesn't fire, infer from host
        if (!subdomain) {
            let host = reqHeaders.get('host') || '';
            host = host.split(':')[0]; // Remove port
            const hostParts = host.split('.');
            if (hostParts.length > 1 && !['localhost', '127', 'app', 'www'].includes(hostParts[0])) {
                subdomain = hostParts[0];
            }
        }

        // If no subdomain is detected (e.g. running on main domain or localhost directly),
        // we can just run the action normally against the main database.
        if (!subdomain) {
            return action(...args);
        }

        // Ideally, we look up the DB URL from the 'Tenant' table in the main DB here.
        // For demonstration (Phase 1/2), let's assume we fetch it. 
        // We will need a proper query to Main DB. Let's do that:
        // Note: Using a direct Prisma query here uses the fallback/Main DB because 
        // we haven't entered the tenant context yet!

        let targetDbUrl: string | null = null;
        try {
            // dynamic import to avoid circular dependency
            const { prisma } = await import('@/lib/prisma');
            const tenant = await prisma.tenant.findUnique({
                where: { subdomain }
            });
            targetDbUrl = tenant?.dbUrl || null;
        } catch (error) {
            console.error('[TenantWrapper] Error fetching tenant:', error);
        }

        if (!targetDbUrl) {
            throw new Error(`Tenant database not found for subdomain: ${subdomain}`);
        }

        const tenantDb = getTenantDb(targetDbUrl);

        // Run the action inside the AsyncLocalStorage context
        return tenantContext.run(tenantDb, () => {
            return action(...args);
        });
    }) as T;
}

/**
 * Higher Order Function to wrap Next.js App Router API Handlers (GET, POST, etc.)
 */
import { NextRequest, NextResponse } from 'next/server';

export function withTenantRoute(
    handler: (req: NextRequest, ...args: any[]) => Promise<NextResponse | Response | undefined | void> | NextResponse | Response | undefined | void
) {
    return async (req: NextRequest, ...args: any[]) => {
        let subdomain = req.headers.get('x-tenant-subdomain');

        if (!subdomain) {
            let host = req.headers.get('host') || '';
            host = host.split(':')[0]; // Remove port
            const hostParts = host.split('.');
            if (hostParts.length > 1 && !['localhost', '127', 'app', 'www'].includes(hostParts[0])) {
                subdomain = hostParts[0];
            }
        }

        if (!subdomain) {
            return handler(req, ...args);
        }

        let targetDbUrl: string | null = null;
        try {
            const { prisma } = await import('@/lib/prisma');
            const tenant = await prisma.tenant.findUnique({
                where: { subdomain }
            });
            targetDbUrl = tenant?.dbUrl || null;
        } catch (error) {
            console.error('[TenantRouteWrapper] Error fetching tenant:', error);
        }

        if (!targetDbUrl) {
            return NextResponse.json(
                { error: `Tenant database not found for subdomain: ${subdomain}` },
                { status: 404 }
            );
        }

        const tenantDb = getTenantDb(targetDbUrl);

        return tenantContext.run(tenantDb, () => {
            return handler(req, ...args);
        });
    };
}
