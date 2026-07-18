/**
 * Client-safe subdomain utilities. Deliberately has NO server-only imports
 * (no `next/headers`, no Prisma) so it can be imported from both client
 * components (e.g. login-form.tsx) and server code (proxy.ts, auth.ts).
 *
 * `src/lib/core/tenant.ts` re-exports from here for backward compatibility —
 * prefer importing directly from this file in client components to avoid
 * accidentally pulling in tenant.ts's server-only dependencies.
 */

/**
 * Reserved subdomains that are NOT tenants. Requests on these hosts resolve
 * against the main DB (e.g. superadmin portal at admin.polyflow.uk), not a
 * tenant DB.
 */
export const RESERVED_SUBDOMAINS = new Set(['admin', 'www', 'app', 'api', 'auth', 'static', 'assets']);

/**
 * Robust utility to extract tenant subdomain from a host string.
 * Supports both standard PROD domains (e.g., tenant.polyflow.uk)
 * and local dev environments (e.g., tenant.localhost:3000)
 *
 * Returns null for reserved subdomains (e.g. admin, www) so those hosts
 * resolve against the main DB instead of being treated as a tenant.
 */
export function extractSubdomain(host: string): string | null {
    if (!host) return null;

    // Remove port if present
    const hostname = host.split(':')[0];

    let subdomain: string | null = null;

    // Check local dev mode first
    if (hostname.endsWith('.localhost')) {
        subdomain = hostname.replace('.localhost', '');
    } else {
        // Production/Staging base domain extraction
        const baseDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'polyflow.uk';
        if (hostname.endsWith(`.${baseDomain}`)) {
            subdomain = hostname.replace(`.${baseDomain}`, '');
        }
    }

    if (!subdomain) return null;

    // Reserved subdomains are not tenants (resolve against main DB).
    if (RESERVED_SUBDOMAINS.has(subdomain.toLowerCase())) return null;

    return subdomain;
}
