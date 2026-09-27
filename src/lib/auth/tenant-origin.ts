import { extractSubdomain } from '@/lib/core/subdomain';
import { AuthorizationError } from '@/lib/errors/errors';

export interface TenantOriginRecord {
    id: string;
    subdomain: string;
    status: string;
}

/**
 * Builds tenant URLs only from a registry record. Caller-supplied return URLs
 * and protocols never participate, preventing open redirects and tenant spoofing.
 */
export function buildTenantOrigin(
    tenant: TenantOriginRecord,
    options: {
        rootDomain?: string;
        protocol?: 'http:' | 'https:';
        port?: string;
    } = {},
): string {
    if (tenant.status !== 'ACTIVE')
        throw new AuthorizationError('Tenant tidak aktif.');
    const rootDomain =
        options.rootDomain ??
        process.env.NEXT_PUBLIC_ROOT_DOMAIN ??
        'polyflow.uk';
    const protocol = options.protocol ?? 'https:';
    const port = options.port ? `:${options.port}` : '';
    const host = `${tenant.subdomain}.${rootDomain}${port}`;
    if (extractSubdomain(host) !== tenant.subdomain) {
        throw new AuthorizationError('Origin tenant tidak valid.');
    }
    return `${protocol}//${host}`;
}
