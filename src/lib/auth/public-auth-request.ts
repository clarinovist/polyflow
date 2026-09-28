import { extractSubdomain } from '@/lib/core/subdomain';

/**
 * Rebuild an Auth.js route request from the trusted public Host/proto headers.
 * This prevents Next's internal 0.0.0.0 bind URL from becoming an OAuth
 * callback/error URL while preserving the original method, body and cookies.
 */
export function withPublicAuthUrl(request: Request): Request {
    const forwardedHost = request.headers.get('x-forwarded-host');
    const host = forwardedHost || request.headers.get('host');
    if (!host || !extractSubdomain(host)) return request;

    const forwardedProto = request.headers.get('x-forwarded-proto');
    const protocol = forwardedProto
        ? forwardedProto.endsWith(':')
            ? forwardedProto
            : `${forwardedProto}:`
        : 'https:';
    const internal = new URL(request.url);
    const publicUrl = new URL(
        internal.pathname + internal.search,
        `${protocol}//${host}`,
    );
    if (publicUrl.origin === internal.origin) return request;
    return new Request(publicUrl, request);
}
