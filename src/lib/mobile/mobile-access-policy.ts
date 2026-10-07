import { hasRole, hasAnyRole } from '@/lib/auth/roles';
import {
    MOBILE_PORTAL_REGISTRY,
    MOBILE_ROUTE_ALIASES,
} from '@/lib/mobile/mobile-portal-registry';
import { getMobileAllowlistPrefixes } from '@/lib/mobile/mobile-static-policy';
import {
    getAvailableMobilePortals as resolveAvailableMobilePortals,
    type MobilePortalDecisionContext,
    type MobilePortalInfo,
} from '@/lib/mobile/mobile-portal-decision';

// ---------------------------------------------------------------------------
// Mobile UA detection — same regex as existing sales redirect
// ---------------------------------------------------------------------------
const MOBILE_UA_RE =
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
// Allowlisted operational surfaces — canonical prefixes are derived from the
// registry. Public/auth paths and operational API paths remain separate lists.
// ---------------------------------------------------------------------------
export function isMobileAllowlistedPath(pathname: string): boolean {
    return getMobileAllowlistPrefixes().some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
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
// Production soft-landing — /production/* (except /production/mobile) → /kiosk
// ---------------------------------------------------------------------------
export function shouldSoftLandToKiosk(pathname: string): boolean {
    return (
        pathname.startsWith('/production') &&
        !pathname.startsWith('/production/mobile')
    );
}

// ---------------------------------------------------------------------------
// Dashboard soft-landing — /dashboard → mobile home by role
// ---------------------------------------------------------------------------
export function shouldSoftLandDashboard(pathname: string): boolean {
    return pathname === '/dashboard';
}

// ---------------------------------------------------------------------------
// Operational API paths — endpoints called by mobile operational surfaces
// (e.g. kiosk attendance selfie upload, kiosk production output photo,
// and warehouse mobile attachment upload).
// Only these /api/* paths pass the mobile gate; all other /api/* remain
// blocked.
// ---------------------------------------------------------------------------
const MOBILE_OPERATIONAL_API_PATHS = [
    '/api/upload/attendance-photo',
    '/api/upload/production-photo',
    '/api/upload/warehouse-attachment',
    '/api/production/daily-report',
];

export function isMobileOperationalApiPath(pathname: string): boolean {
    return MOBILE_OPERATIONAL_API_PATHS.includes(pathname);
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
export type { MobilePortalInfo } from '@/lib/mobile/mobile-portal-decision';

/**
 * Compatibility wrapper for optimistic role-only callers and verified server
 * discovery. New authorization code should call the pure resolver directly.
 */
export function getAvailableMobilePortals(
    user: MobilePortalDecisionContext['user'],
    access?: Omit<MobilePortalDecisionContext, 'user'>,
): MobilePortalInfo[] {
    if (access) return resolveAvailableMobilePortals({ user, ...access });
    if (!user || user.isSuperAdmin || hasRole(user, 'ADMIN')) return [];

    const roles = [user.role, ...(user.roles ?? [])]
        .filter(Boolean)
        .map((role) => String(role).toUpperCase());
    return MOBILE_PORTAL_REGISTRY.flatMap((portal) => {
        if (portal.status === 'PLANNED') return [];
        if (portal.id === 'sales-field' && roles.includes('MARKETING')) {
            return [];
        }
        if (!portal.roles.some((role) => roles.includes(role))) return [];
        return [
            {
                id: portal.id,
                title: portal.title,
                description: portal.description,
                path: portal.path,
                icon: portal.icon,
                status: portal.status,
                mode: portal.mode,
                capabilities: [],
                navigation: portal.navigation,
            },
        ];
    });
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
    // Permissions and entitlements are resolved server-side at the selector,
    // never inferred from the role-only JWT candidate list.
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
 * Mutation rights inside the production mobile portal (Buat SPK, quick SPK
 * form, other execution affordances). FACTORY_MANAGER is deliberately
 * excluded: the Kepala Pabrik surface is read-only executive monitoring.
 * ADMIN keeps operational control.
 */
export function isMobileSupervisorOperator(
    user:
        | {
              role?: string;
              roles?: string[];
              isSuperAdmin?: boolean;
          }
        | null
        | undefined,
): boolean {
    if (hasRole(user, 'FACTORY_MANAGER') && !hasRole(user, 'ADMIN')) {
        return false;
    }
    return (
        hasAnyRole(user, ['PRODUCTION', 'PLANNING', 'ADMIN']) ||
        !!user?.isSuperAdmin
    );
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
