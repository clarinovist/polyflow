/**
 * Mobile Portal Registry — source of truth for mobile portal definitions.
 *
 * Each portal represents a role-based operational surface on mobile.
 * Resolver combines: session validity, module entitlement, role/permission,
 * feature rollout flag, and mobile allowlist.
 *
 * Portal status:
 * - ACTIVE: live in production
 * - BETA: available for limited rollout
 * - PLANNED: defined but not yet implemented
 *
 * @see docs/plan/2026-07-28-mobile-scope-strategy.md §6.1
 */

export type MobilePortalId =
    | 'sales-field'
    | 'warehouse'
    | 'production-kiosk'
    | 'production-supervisor'
    | 'purchasing'
    | 'finance'
    | 'hrd-supervisor'
    | 'maklon';

export type MobilePortalMode = 'EXECUTION' | 'SUPERVISION' | 'SELF_SERVICE';

export type MobilePortalStatus = 'ACTIVE' | 'BETA' | 'PLANNED';

export interface MobilePortalDefinition {
    id: MobilePortalId;
    title: string;
    description: string;
    path: string;
    /** Module key from module-registry — used for entitlement check */
    moduleKey: string;
    mode: MobilePortalMode;
    status: MobilePortalStatus;
    /** Roles that can see this portal (checked via hasRole) */
    roles: string[];
    /** Permission resource root for this portal */
    permissionRoot: string;
    /** Optional feature flag required for portal visibility */
    requiredFeature?: string;
    /** Icon name from lucide-react */
    icon: string;
}

// ---------------------------------------------------------------------------
// Registry — all known portals
// ---------------------------------------------------------------------------
export const MOBILE_PORTAL_REGISTRY: MobilePortalDefinition[] = [
    {
        id: 'sales-field',
        title: 'Sales Field',
        description: 'Absensi sales, kunjungan customer, dan buat SO',
        path: '/field/sales',
        moduleKey: 'SALES',
        mode: 'EXECUTION',
        status: 'ACTIVE',
        roles: ['SALES'],
        permissionRoot: '/sales',
        icon: 'ShoppingBag',
    },
    {
        id: 'warehouse',
        title: 'Gudang Mobile',
        description: 'Penerimaan, pengeluaran, & stock opname barang',
        path: '/warehouse/mobile',
        moduleKey: 'INVENTORY',
        mode: 'EXECUTION',
        status: 'ACTIVE',
        roles: ['WAREHOUSE'],
        permissionRoot: '/warehouse',
        icon: 'Package',
    },
    {
        id: 'production-kiosk',
        title: 'Kiosk Produksi',
        description: 'Input hasil kerja operator & monitoring mesin',
        path: '/kiosk',
        moduleKey: 'PRODUCTION',
        mode: 'EXECUTION',
        status: 'ACTIVE',
        roles: ['PRODUCTION'],
        permissionRoot: '/kiosk',
        icon: 'Factory',
    },
    {
        id: 'production-supervisor',
        title: 'Supervisor Produksi',
        description: 'Monitoring output, downtime, dan QC shift ini',
        path: '/production/mobile',
        moduleKey: 'PRODUCTION',
        mode: 'SUPERVISION',
        status: 'PLANNED',
        roles: ['PRODUCTION', 'PLANNING'],
        permissionRoot: '/production',
        requiredFeature: 'feature:mobile-production-supervisor',
        icon: 'ClipboardCheck',
    },
    {
        id: 'purchasing',
        title: 'Purchasing Mobile',
        description: 'Monitor PR, PO, receipt, dan overdue AP',
        path: '/purchasing/mobile',
        moduleKey: 'PURCHASING',
        mode: 'SUPERVISION',
        status: 'PLANNED',
        roles: ['PROCUREMENT', 'PLANNING'],
        permissionRoot: '/purchasing',
        requiredFeature: 'feature:mobile-purchasing',
        icon: 'ShoppingCart',
    },
    {
        id: 'finance',
        title: 'Finance Mobile',
        description: 'Monitor AR/AP overdue, draft journal, dan reconciliation',
        path: '/finance/mobile',
        moduleKey: 'FINANCE',
        mode: 'SUPERVISION',
        status: 'PLANNED',
        roles: ['FINANCE'],
        permissionRoot: '/finance',
        requiredFeature: 'feature:mobile-finance',
        icon: 'Wallet',
    },
    {
        id: 'hrd-supervisor',
        title: 'HRD Mobile',
        description: 'Kehadiran, cuti pending, dan alert HR',
        path: '/hrd/mobile',
        moduleKey: 'HRD',
        mode: 'SUPERVISION',
        status: 'PLANNED',
        roles: ['HRD'],
        permissionRoot: '/hrd',
        requiredFeature: 'feature:mobile-hrd-supervisor',
        icon: 'Users',
    },
    {
        id: 'maklon',
        title: 'Maklon Mobile',
        description: 'Penerimaan material, retur, dan QC evidence',
        path: '/maklon/mobile',
        moduleKey: 'MAKLON',
        mode: 'EXECUTION',
        status: 'PLANNED',
        roles: ['WAREHOUSE'],
        permissionRoot: '/maklon',
        requiredFeature: 'feature:mobile-maklon',
        icon: 'Boxes',
    },
];

// ---------------------------------------------------------------------------
// Legacy route aliases — maps old paths to canonical portal paths
// ---------------------------------------------------------------------------
export const MOBILE_ROUTE_ALIASES: Record<string, string> = {
    '/sales/mobile': '/field/sales',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a portal definition by ID */
export function getMobilePortalById(
    id: MobilePortalId,
): MobilePortalDefinition | undefined {
    return MOBILE_PORTAL_REGISTRY.find((p) => p.id === id);
}

/** Get all portals with a given status */
export function getMobilePortalsByStatus(
    status: MobilePortalStatus,
): MobilePortalDefinition[] {
    return MOBILE_PORTAL_REGISTRY.filter((p) => p.status === status);
}

/** Check if a path is a mobile portal canonical path */
export function isMobilePortalPath(path: string): boolean {
    return MOBILE_PORTAL_REGISTRY.some(
        (p) => path === p.path || path.startsWith(`${p.path}/`),
    );
}

/** Resolve a legacy alias path to canonical, or return the original path */
export function resolveMobileAlias(path: string): string {
    const exact = MOBILE_ROUTE_ALIASES[path];
    if (exact) return exact;
    // Check prefix aliases
    for (const [alias, canonical] of Object.entries(MOBILE_ROUTE_ALIASES)) {
        if (path.startsWith(`${alias}/`)) {
            return path.replace(alias, canonical);
        }
    }
    return path;
}
