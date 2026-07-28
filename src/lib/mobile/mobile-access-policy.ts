import { hasRole, getUserRoles } from '@/lib/auth/roles';
import {
    MOBILE_PORTAL_REGISTRY,
    MOBILE_ROUTE_ALIASES,
} from '@/lib/mobile/mobile-portal-registry';

// ---------------------------------------------------------------------------
// Mobile UA detection — same regex as existing sales redirect
// ---------------------------------------------------------------------------
export const MOBILE_UA_RE =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function isMobileUserAgent(ua: string | null | undefined): boolean {
    return MOBILE_UA_RE.test(ua ?? '');
}

// ---------------------------------------------------------------------------
// Public paths — always reachable from mobile (auth endpoints, rejection page)
// ---------------------------------------------------------------------------
const MOBILE_PUBLIC_PATHS = [
    '/login',
    '/logout',
    '/register',
    '/device/desktop-required',
    '/api/auth',
];

export function isMobilePublicPath(pathname: string): boolean {
    return MOBILE_PUBLIC_PATHS.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
}

// ---------------------------------------------------------------------------
// Allowlisted operational surfaces — only these prefixes are accessible on
// mobile (after RBAC).
// ---------------------------------------------------------------------------
const MOBILE_ALLOWLIST_PREFIXES = [
    '/mobile',
    '/field',
    '/sales/mobile',
    '/kiosk',
    '/my',
    '/warehouse/mobile',
];

export function isMobileAllowlistedPath(pathname: string): boolean {
    return MOBILE_ALLOWLIST_PREFIXES.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
}

// ---------------------------------------------------------------------------
// Sales soft-landing — /sales/* (not /sales/mobile, not /field) → redirect
// to /field/sales (new operational field portal).
// ---------------------------------------------------------------------------
export function shouldSoftLandToSalesMobile(pathname: string): boolean {
    return (
        pathname.startsWith('/sales') &&
        !pathname.startsWith('/sales/mobile') &&
        !pathname.startsWith('/field')
    );
}

// ---------------------------------------------------------------------------
// Warehouse soft-landing — /warehouse/* (not /warehouse/mobile) → redirect
// ---------------------------------------------------------------------------
export function shouldSoftLandToWarehouseMobile(pathname: string): boolean {
    return (
        pathname.startsWith('/warehouse') &&
        !pathname.startsWith('/warehouse/mobile')
    );
}

// ---------------------------------------------------------------------------
// Production soft-landing — /production/* → /kiosk
// ---------------------------------------------------------------------------
export function shouldSoftLandToKiosk(pathname: string): boolean {
    return pathname.startsWith('/production');
}

// ---------------------------------------------------------------------------
// Dashboard soft-landing — /dashboard → mobile home by role
// ---------------------------------------------------------------------------
export function shouldSoftLandDashboard(pathname: string): boolean {
    return pathname === '/dashboard';
}

// ---------------------------------------------------------------------------
// Bypass — only ADMIN (or superadmin / impersonation) may bypass mobile gate
// ---------------------------------------------------------------------------
export function isMobileBypassAllowed(
    user:
        | {
              role?: string;
              roles?: string[];
              isSuperAdmin?: boolean;
          }
        | null
        | undefined,
): boolean {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return hasRole(user, 'ADMIN');
}

// ---------------------------------------------------------------------------
// Multi-role Available Portals & Home Redirect
// ---------------------------------------------------------------------------
export interface MobilePortalInfo {
    id: string;
    title: string;
    description: string;
    path: string;
    icon: string;
    requiredFeature?: string;
    status: string;
}

/**
 * Resolve which portals a user can access.
 * Combines role check with portal status (ACTIVE only for general users;
 * ADMIN can preview BETA/PLANNED portals).
 */
export function getAvailableMobilePortals(
    user:
        | {
              role?: string;
              roles?: string[];
              isSuperAdmin?: boolean;
          }
        | null
        | undefined,
): MobilePortalInfo[] {
    if (!user) return [];
    const roles = getUserRoles(user);
    const isAdmin = hasRole(user, 'ADMIN') || !!user.isSuperAdmin;

    const portals: MobilePortalInfo[] = [];

    for (const portal of MOBILE_PORTAL_REGISTRY) {
        if (portal.status === 'PLANNED' && !isAdmin) continue;
        if (portal.status === 'BETA' && !isAdmin) continue;

        if (
            portal.id === 'sales-field' &&
            roles.includes('MARKETING')
        ) {
            continue;
        }

        const hasMatchingRole = portal.roles.some((r) => roles.includes(r));
        if (!hasMatchingRole) continue;

        portals.push({
            id: portal.id,
            title: portal.title,
            description: portal.description,
            path: portal.path,
            icon: portal.icon,
            requiredFeature: portal.requiredFeature,
            status: portal.status,
        });
    }

    return portals;
}

export function getMobileHomeForUser(
    user:
        | {
              role?: string;
              roles?: string[];
          }
        | null
        | undefined,
): string | null {
    const portals = getAvailableMobilePortals(user);
    if (portals.length === 0) return null;
    if (portals.length === 1) return portals[0].path;
    return '/mobile';
}

/** Label key for desktop-required CTA */
export type MobileHomeCtaKey = string | null;

export function getMobileHomeCtaKey(
    user:
        | {
              role?: string;
              roles?: string[];
          }
        | null
        | undefined,
): MobileHomeCtaKey {
    if (!user) return null;
    const portals = getAvailableMobilePortals(user);
    if (portals.length === 0) return null;
    if (portals.length === 1) return portals[0].id;
    return 'selector';
}

/**
 * Resolve a legacy mobile path to its canonical form using route aliases.
 */
export function resolveMobilePath(path: string): string {
    const exact = MOBILE_ROUTE_ALIASES[path];
    if (exact) return exact;
    for (const [alias, canonical] of Object.entries(MOBILE_ROUTE_ALIASES)) {
        if (path.startsWith(`${alias}/`)) {
            return path.replace(alias, canonical);
        }
    }
    return path;
}
