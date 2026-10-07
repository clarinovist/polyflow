/**
 * Typed source of truth for mobile portal presentation and access metadata.
 *
 * The registry describes the contract; it does not authorize a request by
 * itself. Proxy only consumes static paths, while selector/layout/action
 * guards combine this metadata with fresh tenant and permission state.
 */

import type { Role } from '@prisma/client';
import type { ModuleKey } from '@/lib/modules/module-registry';

export type MobilePortalId =
    | 'sales-field'
    | 'warehouse'
    | 'production-kiosk'
    | 'production-supervisor'
    | 'purchasing'
    | 'finance'
    | 'hrd-supervisor'
    | 'admin'
    | 'maklon';

export type MobilePortalMode =
    | 'EXECUTION'
    | 'SUPERVISION'
    | 'SELF_SERVICE'
    | 'EXECUTIVE';
export type MobilePortalStatus = 'ACTIVE' | 'BETA' | 'PLANNED';
export type MobileMatchMode = 'ANY' | 'ALL';
export type MobileAdminAccess = 'NONE' | 'READ_ONLY' | 'EXISTING_GUARDS';

export const MOBILE_ACTION_CAPABILITIES = [
    'feature:mobile-maintenance-approval',
    'feature:mobile-purchasing-actions',
    'feature:mobile-finance-actions',
    'feature:mobile-hrd-actions',
    'feature:mobile-marketing-actions',
] as const;

export type MobileActionCapability =
    (typeof MOBILE_ACTION_CAPABILITIES)[number];

export interface MobileNavigationDefinition {
    id: string;
    label: string;
    path: string;
}

export interface MobilePortalResourceRule {
    /** A rule applies when any of these roles is assigned to the user. */
    roles: Role[];
    excludedRoles?: Role[];
    permissionRoots: string[];
    match: MobileMatchMode;
}

export interface MobilePortalDependency {
    moduleKey: ModuleKey;
    permissionRoots: string[];
    match: MobileMatchMode;
}

export interface MobilePortalDefinition {
    id: MobilePortalId;
    title: string;
    description: string;
    path: string;
    moduleKey: ModuleKey;
    mode: MobilePortalMode;
    status: MobilePortalStatus;
    roles: Role[];
    roleMatch: MobileMatchMode;
    resourceRules: MobilePortalResourceRule[];
    dataDependencies?: MobilePortalDependency[];
    rolloutKey?: string;
    adminAccess: MobileAdminAccess;
    capabilities: MobileActionCapability[];
    navigation: MobileNavigationDefinition[];
    /** Icon name from lucide-react, resolved by the selector. */
    icon: string;
}

export const MOBILE_PORTAL_REGISTRY = [
    {
        id: 'sales-field',
        title: 'Sales Field',
        description: 'Absensi sales, kunjungan customer, dan buat SO',
        path: '/field/sales',
        moduleKey: 'SALES',
        mode: 'EXECUTION',
        status: 'ACTIVE',
        roles: ['SALES'],
        roleMatch: 'ANY',
        resourceRules: [
            {
                roles: ['SALES'],
                permissionRoots: ['/field/sales'],
                match: 'ANY',
            },
        ],
        adminAccess: 'NONE',
        capabilities: [],
        navigation: [
            { id: 'home', label: 'Beranda', path: '/field/sales' },
            {
                id: 'customers',
                label: 'Customer',
                path: '/field/sales/customers',
            },
            { id: 'orders', label: 'Order', path: '/field/sales/orders' },
            { id: 'visits', label: 'Kunjungan', path: '/field/sales/visits' },
            { id: 'stock', label: 'Stok', path: '/field/sales/stock' },
        ],
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
        roleMatch: 'ANY',
        resourceRules: [
            {
                roles: ['WAREHOUSE'],
                permissionRoots: ['/warehouse/mobile'],
                match: 'ANY',
            },
        ],
        adminAccess: 'NONE',
        capabilities: [],
        navigation: [
            { id: 'home', label: 'Beranda', path: '/warehouse/mobile' },
            {
                id: 'outgoing',
                label: 'Muat',
                path: '/warehouse/mobile/outgoing',
            },
            {
                id: 'incoming',
                label: 'Terima',
                path: '/warehouse/mobile/incoming',
            },
            { id: 'opname', label: 'Opname', path: '/warehouse/mobile/opname' },
        ],
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
        roleMatch: 'ANY',
        resourceRules: [
            {
                roles: ['PRODUCTION'],
                permissionRoots: ['/kiosk', '/production'],
                match: 'ANY',
            },
        ],
        adminAccess: 'NONE',
        capabilities: [],
        navigation: [],
        icon: 'Factory',
    },
    {
        id: 'production-supervisor',
        title: 'Supervisor Produksi',
        description: 'Monitoring output, downtime, dan QC shift ini',
        path: '/production/mobile',
        moduleKey: 'PRODUCTION',
        mode: 'SUPERVISION',
        status: 'ACTIVE',
        roles: ['PRODUCTION', 'PLANNING', 'FACTORY_MANAGER'],
        roleMatch: 'ANY',
        resourceRules: [
            {
                roles: ['FACTORY_MANAGER'],
                permissionRoots: [
                    '/production/daily',
                    '/warehouse/inventory',
                    '/purchasing/requests',
                    '/purchasing/orders',
                ],
                match: 'ALL',
            },
            {
                // Operational roles own the production portal contract.
                // FACTORY_MANAGER stays on the stricter rule above even when
                // assigned an additional operational role.
                roles: ['PRODUCTION', 'PLANNING'],
                excludedRoles: ['FACTORY_MANAGER'],
                permissionRoots: ['/production/mobile'],
                match: 'ANY',
            },
        ],
        adminAccess: 'EXISTING_GUARDS',
        capabilities: ['feature:mobile-maintenance-approval'],
        navigation: [
            { id: 'home', label: 'Hari Ini', path: '/production/mobile' },
            { id: 'tasks', label: 'SPK', path: '/production/mobile/tasks' },
            {
                id: 'attendance',
                label: 'Absensi',
                path: '/production/mobile/attendance',
            },
            {
                id: 'maintenance',
                label: 'Maintenance',
                path: '/production/mobile/maintenance',
            },
            {
                id: 'insights',
                label: 'Insight',
                path: '/production/mobile/insights',
            },
        ],
        icon: 'ClipboardCheck',
    },
    {
        id: 'purchasing',
        title: 'Purchasing Mobile',
        description: 'Monitor PR, PO, receipt, dan overdue AP',
        path: '/purchasing/mobile',
        moduleKey: 'PURCHASING',
        mode: 'SUPERVISION',
        status: 'ACTIVE',
        roles: ['PROCUREMENT', 'PLANNING'],
        roleMatch: 'ANY',
        resourceRules: [
            {
                roles: ['PROCUREMENT', 'PLANNING'],
                permissionRoots: ['/purchasing/mobile'],
                match: 'ANY',
            },
        ],
        adminAccess: 'NONE',
        capabilities: ['feature:mobile-purchasing-actions'],
        navigation: [
            { id: 'home', label: 'Hari Ini', path: '/purchasing/mobile' },
            { id: 'tasks', label: 'Tugas', path: '/purchasing/mobile/tasks' },
            {
                id: 'insights',
                label: 'Insight',
                path: '/purchasing/mobile/insights',
            },
        ],
        icon: 'ShoppingCart',
    },
    {
        id: 'finance',
        title: 'Finance Mobile',
        description: 'Monitor AR/AP overdue, draft journal, dan reconciliation',
        path: '/finance/mobile',
        moduleKey: 'FINANCE',
        mode: 'SUPERVISION',
        status: 'ACTIVE',
        roles: ['FINANCE'],
        roleMatch: 'ANY',
        resourceRules: [
            {
                roles: ['FINANCE'],
                permissionRoots: ['/finance/mobile'],
                match: 'ANY',
            },
        ],
        adminAccess: 'NONE',
        capabilities: ['feature:mobile-finance-actions'],
        navigation: [
            { id: 'home', label: 'Hari Ini', path: '/finance/mobile' },
            { id: 'tasks', label: 'Tugas', path: '/finance/mobile/tasks' },
            {
                id: 'insights',
                label: 'Insight',
                path: '/finance/mobile/insights',
            },
        ],
        icon: 'Wallet',
    },
    {
        id: 'hrd-supervisor',
        title: 'HRD Mobile',
        description: 'Kehadiran, cuti pending, dan alert HR',
        path: '/hrd/mobile',
        moduleKey: 'HRD',
        mode: 'SUPERVISION',
        status: 'ACTIVE',
        roles: ['HRD'],
        roleMatch: 'ANY',
        resourceRules: [
            {
                roles: ['HRD'],
                permissionRoots: ['/hrd/mobile'],
                match: 'ANY',
            },
        ],
        adminAccess: 'NONE',
        capabilities: ['feature:mobile-hrd-actions'],
        navigation: [
            { id: 'home', label: 'Hari Ini', path: '/hrd/mobile' },
            {
                id: 'attendance',
                label: 'Absensi',
                path: '/hrd/mobile/attendance',
            },
            { id: 'leave', label: 'Cuti', path: '/hrd/mobile/tasks' },
            { id: 'insights', label: 'Insight', path: '/hrd/mobile/insights' },
        ],
        icon: 'Users',
    },
    {
        id: 'admin',
        title: 'Admin Command Center',
        description: 'Pantau pengecualian lintas modul tanpa mengubah data',
        path: '/mobile/admin',
        moduleKey: 'CORE',
        mode: 'EXECUTIVE',
        status: 'BETA',
        roles: ['ADMIN'],
        roleMatch: 'ANY',
        resourceRules: [
            {
                roles: ['ADMIN'],
                permissionRoots: ['/dashboard'],
                match: 'ANY',
            },
        ],
        dataDependencies: [
            { moduleKey: 'PRODUCTION', permissionRoots: ['/production'], match: 'ANY' },
            { moduleKey: 'INVENTORY', permissionRoots: ['/warehouse/inventory'], match: 'ANY' },
            { moduleKey: 'PURCHASING', permissionRoots: ['/purchasing'], match: 'ANY' },
            { moduleKey: 'FINANCE', permissionRoots: ['/finance'], match: 'ANY' },
            { moduleKey: 'HRD', permissionRoots: ['/hrd'], match: 'ANY' },
        ],
        rolloutKey: 'mobile.portal.admin.enabled',
        adminAccess: 'READ_ONLY',
        capabilities: [],
        navigation: [
            { id: 'home', label: 'Hari Ini', path: '/mobile/admin' },
            {
                id: 'attention',
                label: 'Perhatian',
                path: '/mobile/admin/attention',
            },
            {
                id: 'insights',
                label: 'Insight',
                path: '/mobile/admin/insights',
            },
            { id: 'portals', label: 'Portal', path: '/mobile' },
        ],
        icon: 'ShieldCheck',
    },
    {
        id: 'maklon',
        title: 'Maklon Mobile',
        description: 'Penerimaan material, retur, dan QC evidence',
        path: '/maklon/mobile',
        moduleKey: 'MAKLON',
        mode: 'EXECUTION',
        status: 'PLANNED',
        roles: ['PROCUREMENT', 'PLANNING', 'WAREHOUSE'],
        roleMatch: 'ANY',
        resourceRules: [
            {
                roles: ['PROCUREMENT', 'PLANNING', 'WAREHOUSE'],
                permissionRoots: ['/maklon'],
                match: 'ANY',
            },
        ],
        adminAccess: 'NONE',
        capabilities: [],
        navigation: [
            { id: 'home', label: 'Hari Ini', path: '/maklon/mobile' },
            {
                id: 'incoming',
                label: 'Terima',
                path: '/maklon/mobile/incoming',
            },
            { id: 'returns', label: 'Retur', path: '/maklon/mobile/returns' },
            { id: 'qc', label: 'QC', path: '/maklon/mobile/qc' },
        ],
        icon: 'Boxes',
    },
] as MobilePortalDefinition[];

export const MOBILE_ROUTE_ALIASES: Record<string, string> = {
    '/sales/mobile': '/field/sales',
};

export function getMobilePortalById(
    id: MobilePortalId,
): MobilePortalDefinition | undefined {
    return MOBILE_PORTAL_REGISTRY.find((portal) => portal.id === id);
}

export function getMobilePortalsByStatus(
    status: MobilePortalStatus,
): MobilePortalDefinition[] {
    return MOBILE_PORTAL_REGISTRY.filter((portal) => portal.status === status);
}

export function resolveMobileAlias(path: string): string {
    const exact = MOBILE_ROUTE_ALIASES[path];
    if (exact) return exact;
    for (const [alias, canonical] of Object.entries(MOBILE_ROUTE_ALIASES)) {
        if (path.startsWith(`${alias}/`)) {
            return path.replace(alias, canonical);
        }
    }
    return path;
}

export function getMobilePortalByPath(
    path: string,
): MobilePortalDefinition | undefined {
    const canonical = resolveMobileAlias(path);
    return MOBILE_PORTAL_REGISTRY.find(
        (portal) =>
            canonical === portal.path ||
            canonical.startsWith(`${portal.path}/`),
    );
}

export function isMobilePortalPath(path: string): boolean {
    return getMobilePortalByPath(path) !== undefined;
}
