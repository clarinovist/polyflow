import { getTenantDb, tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { PrismaClient } from '@prisma/client';
import { headers } from 'next/headers';

// Subdomain parsing lives in a client-safe module (no server-only imports) so
// it can be shared with client components like login-form.tsx. Imported here
// (and re-exported) for backward compatibility with existing server-side callers.
import { extractSubdomain, RESERVED_SUBDOMAINS } from '@/lib/core/subdomain';
export { extractSubdomain, RESERVED_SUBDOMAINS };

export type TenantResolutionResult =
    | { type: 'NONE' }
    | { type: 'NOT_FOUND'; subdomain: string }
    | { type: 'RESOLVED'; tenantDb: PrismaClient; tenantId: string; subdomain: string };

/**
 * Unified helper to resolve tenant DB target from standard HTTP Headers.
 * Checks x-tenant-subdomain > host > x-forwarded-host (for Docker/nginx).
 */
export async function resolveTenantContext(
    reqHeaders: { get: (name: string) => string | null }
): Promise<TenantResolutionResult> {
    let subdomain = reqHeaders.get('x-tenant-subdomain');

    if (!subdomain) {
        // Try host header first, then x-forwarded-host (set by nginx in Docker)
        const host = reqHeaders.get('host') || '';
        subdomain = extractSubdomain(host);

        if (!subdomain) {
            const forwardedHost = reqHeaders.get('x-forwarded-host') || '';
            subdomain = extractSubdomain(forwardedHost);
        }
    }

    // TEMP DEBUG — remove after diagnosing admin.polyflow.uk tenant-leak issue
    console.error('[RESOLVE_TENANT_DEBUG]', {
        xTenantSubdomainHeader: reqHeaders.get('x-tenant-subdomain'),
        hostHeader: reqHeaders.get('host'),
        xForwardedHostHeader: reqHeaders.get('x-forwarded-host'),
        resolvedSubdomain: subdomain,
        activeContextLeaked: !!tenantContext.getStore(),
    });

    if (!subdomain) {
        return { type: 'NONE' };
    }

    let targetDbUrl: string | null = null;
    let resolvedTenantId: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            // CRITICAL: Always use mainPrisma for tenant lookup.
            // The prisma proxy routes to tenant DB if AsyncLocalStorage context
            // is leaked from a previous request — but the Tenant table only
            // exists in the main database. Using the proxy here causes
            // "Tenant not found" errors when context leaks.
            const { getMainPrisma, tenantContext } = await import('@/lib/core/prisma');
            const activeTenantDb = tenantContext.getStore();
            if (activeTenantDb && attempt === 1) {
                console.warn(`[resolveTenantContext] LEAKED context detected for subdomain="${subdomain}" — bypassing with mainPrisma`);
            }
            const mainPrisma = getMainPrisma();
            const tenant = await mainPrisma.tenant.findUnique({
                where: { subdomain }
            });
            targetDbUrl = tenant?.dbUrl || null;
            if (targetDbUrl) {
                resolvedTenantId = tenant?.id ?? null;
                break;
            }
            // Tenant not found — might be stale cache, retry once
            if (attempt < 3) {
                console.warn(`[resolveTenantContext] Tenant "${subdomain}" not found on attempt ${attempt}, retrying... (activeTenantContext=${!!activeTenantDb}, tenantResult=${JSON.stringify(tenant)})`);
                await new Promise(r => setTimeout(r, 100 * attempt));
            } else {
                console.error(`[resolveTenantContext] FINAL attempt failed: tenant=${JSON.stringify(tenant)}, activeTenantContext=${!!activeTenantDb}`);
            }
        } catch (error) {
            console.error(`[resolveTenantContext] Error fetching tenant (attempt ${attempt}):`, error);
            if (attempt < 3) await new Promise(r => setTimeout(r, 100 * attempt));
        }
    }

    if (!targetDbUrl) {
        console.error(`[resolveTenantContext] NOT_FOUND for subdomain="${subdomain}" — tenant query returned null. host="${reqHeaders.get('host')}" forwarded="${reqHeaders.get('x-forwarded-host')}"`);
        return { type: 'NOT_FOUND', subdomain };
    }

    const tenantDb = getTenantDb(targetDbUrl);
    return { type: 'RESOLVED', tenantDb, tenantId: resolvedTenantId!, subdomain };
}

/**
 * Higher Order Function to wrap Next.js Server Actions.
 * It extracts the subdomain from headers and runs the action within an `AsyncLocalStorage` context.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withTenant<T extends (...args: any[]) => Promise<any>>(action: T): T {
    return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
        const reqHeaders = await headers();
        const result = await resolveTenantContext(reqHeaders);

        if (result.type === 'NONE') {
            return action(...args);
        }

        if (result.type === 'NOT_FOUND') {
            throw new Error(`Tenant database not found for subdomain: ${result.subdomain}`);
        }

        // Run the action inside the AsyncLocalStorage context
        return tenantContext.run(result.tenantDb, () =>
            tenantIdContext.run(result.tenantId, () => action(...args))
        );
    }) as T;
}

/**
 * Higher Order Function to wrap Next.js App Router API Handlers (GET, POST, etc.)
 */
import { NextRequest, NextResponse } from 'next/server';

/**
 * Helper for Server Component data fetching.
 * Usage: const getData = withTenantPage(async () => { ... });
 *        export default async function Page() { const data = await getData(); }
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withTenantPage<T extends (...args: any[]) => Promise<any>>(fetchData: T): T {
    return withTenant(fetchData);
}

export function withTenantRoute(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (req: NextRequest, ...args: any[]) => Promise<NextResponse | Response | undefined | void> | NextResponse | Response | undefined | void
) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async (req: NextRequest, ...args: any[]) => {
        const result = await resolveTenantContext(req.headers);

        if (result.type === 'NONE') {
            return handler(req, ...args);
        }

        if (result.type === 'NOT_FOUND') {
            return NextResponse.json(
                { error: `Tenant database not found for subdomain: ${result.subdomain}` },
                { status: 404 }
            );
        }

        return tenantContext.run(result.tenantDb, () =>
            tenantIdContext.run(result.tenantId, () => handler(req, ...args))
        );
    };
}
