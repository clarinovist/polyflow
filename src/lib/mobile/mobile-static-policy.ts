import {
    MOBILE_PORTAL_REGISTRY,
    MOBILE_ROUTE_ALIASES,
} from '@/lib/mobile/mobile-portal-registry';

// `/owner` is the owner-only HPP calculator; its pages and actions enforce the
// real access check (owner allowlist), this only lets phones reach the route.
const MOBILE_STATIC_PATHS = ['/mobile', '/my', '/owner'] as const;

/**
 * Static Proxy allowlist. Planned portals are intentionally excluded even
 * though their metadata remains available for rollout planning and tests.
 */
export function getMobileAllowlistPrefixes(): string[] {
    return [
        ...MOBILE_STATIC_PATHS,
        ...MOBILE_PORTAL_REGISTRY.filter(
            (portal) => portal.status !== 'PLANNED',
        ).map((portal) => portal.path),
        ...Object.keys(MOBILE_ROUTE_ALIASES),
    ].filter((prefix, index, prefixes) => prefixes.indexOf(prefix) === index);
}
