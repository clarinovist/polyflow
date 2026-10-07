import {
    MOBILE_PORTAL_REGISTRY,
    MOBILE_ROUTE_ALIASES,
} from '@/lib/mobile/mobile-portal-registry';

const MOBILE_STATIC_PATHS = ['/mobile', '/my'] as const;

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
