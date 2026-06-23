import { getTenantDb, tenantContext } from '@/lib/core/prisma';
import { PrismaClient } from '@prisma/client';
import { headers } from 'next/headers';

export type TenantResolutionResult =
    | { type: 'NONE' }
    | { type: 'NOT_FOUND'; subdomain: string }
    | { type: 'RESOLVED'; tenantDb: PrismaClient; subdomain: string };

/**
 * Robust utility to extract tenant subdomain from a host string.
 * Supports both standard PROD domains (e.g., tenant.polyflow.uk) 
 * and local dev environments (e.g., tenant.localhost:3000)
 */
export function extractSubdomain(host: string): string | null {
    if (!host) return null;

    // Remove port if present
    const hostname = host.split(':')[0];

    // Check local dev mode first
    if (hostname.endsWith('.localhost')) {
        return hostname.replace('.localhost', '');
    }

    // Production/Staging base domain extraction
    const baseDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'polyflow.uk';
    if (hostname.endsWith(`.${baseDomain}`)) {
        return hostname.replace(`.${baseDomain}`, '');
    }

    return null;
}

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

    if (!subdomain) {
        return { type: 'NONE' };
    }

    let targetDbUrl: string | null = null;
    try {
        const { prisma } = await import('@/lib/core/prisma');
        const tenant = await prisma.tenant.findUnique({
            where: { subdomain }
        });
        targetDbUrl = tenant?.dbUrl || null;
    } catch (error) {
        console.error('[resolveTenantContext] Error fetching tenant:', error);
    }

    if (!targetDbUrl) {
        return { type: 'NOT_FOUND', subdomain };
    }

    const tenantDb = getTenantDb(targetDbUrl);
    return { type: 'RESOLVED', tenantDb, subdomain };
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
        return tenantContext.run(result.tenantDb, () => {
            return action(...args);
        });
    }) as T;
}

/**
 * Higher Order Function to wrap Next.js App Router API Handlers (GET, POST, etc.)
 */
import { NextRequest, NextResponse } from 'next/server';

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

        return tenantContext.run(result.tenantDb, () => {
            return handler(req, ...args);
        });
    };
}
