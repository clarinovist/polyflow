import { hasRole, getUserRoles } from '@/lib/auth/roles';

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
    id: 'sales' | 'warehouse' | 'production';
    title: string;
    description: string;
    path: string;
    icon: string;
}

export function getAvailableMobilePortals(
    user:
        | {
              role?: string;
              roles?: string[];
          }
        | null
        | undefined,
): MobilePortalInfo[] {
    if (!user) return [];
    const roles = getUserRoles(user);
    const portals: MobilePortalInfo[] = [];

    if (roles.includes('SALES') && !roles.includes('MARKETING')) {
        portals.push({
            id: 'sales',
            title: 'Sales Field',
            description: 'Absensi sales, kunjungan customer, dan buat SO',
            path: '/field/sales',
            icon: 'ShoppingBag',
        });
    }

    if (roles.includes('WAREHOUSE')) {
        portals.push({
            id: 'warehouse',
            title: 'Gudang Mobile',
            description: 'Penerimaan, pengeluaran, & stock opname barang',
            path: '/warehouse/mobile',
            icon: 'Package',
        });
    }

    if (roles.includes('PRODUCTION')) {
        portals.push({
            id: 'production',
            title: 'Kiosk Produksi',
            description: 'Input hasil kerja operator & monitoring mesin',
            path: '/kiosk',
            icon: 'Factory',
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
export type MobileHomeCtaKey =
    | 'sales'
    | 'warehouse'
    | 'production'
    | 'selector'
    | null;

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
