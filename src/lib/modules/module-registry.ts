/**
 * Single source of truth for module definitions, path mapping, dependencies,
 * and commercial package templates.
 *
 * This file is the contract between:
 * - Tenant entitlement (control DB)
 * - Permission catalog (tenant DB)
 * - Navigation/UI filtering
 * - Provisioning
 *
 * Module keys are strings (not Prisma enum) so adding a new module does not
 * require a DB migration just for the enum value. The application validates
 * keys against this registry at compile/test time.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModuleKey =
    | 'CORE'
    | 'HRD'
    | 'SALES'
    | 'PURCHASING'
    | 'PRODUCTION'
    | 'INVENTORY'
    | 'FINANCE'
    | 'MAKLON';

export type CapabilityKey = 'MANUFACTURING_WORKFORCE';

export type ModuleStatus = 'TRIAL' | 'ACTIVE' | 'SUSPEDDED' | 'EXPIRED';

export interface ModuleDefinition {
    key: ModuleKey;
    label: string;
    /** Whether this module is always enabled and cannot be disabled. */
    alwaysActive: boolean;
    /** Workspace root paths owned by this module. */
    workspaceRoots: string[];
    /** Permission root paths owned by this module. */
    permissionRoots: string[];
    /** Landing path for this module. */
    landingPath: string;
    /** Modules that must also be active for this module to work. */
    requiredModules: ModuleKey[];
    /** Capabilities enabled by this module. */
    capabilities: CapabilityKey[];
    /** Routes that require this module (API routes, not page routes). */
    apiRoutes: string[];
    /** Action file prefixes that belong to this module. */
    actionPrefixes: string[];
    /** Service directories that belong to this module. */
    serviceDirs: string[];
    /** Upload route prefixes that belong to this module. */
    uploadPrefixes: string[];
}

export interface PackageTemplate {
    key: string;
    label: string;
    modules: ModuleKey[];
    capabilities?: CapabilityKey[];
}

// ---------------------------------------------------------------------------
// Module Definitions
// ---------------------------------------------------------------------------

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
    {
        key: 'CORE',
        label: 'Core Platform',
        alwaysActive: true,
        workspaceRoots: ['/dashboard', '/admin', '/support', '/my'],
        permissionRoots: ['/dashboard'],
        landingPath: '/dashboard',
        requiredModules: [],
        capabilities: [],
        apiRoutes: [
            '/api/auth',
            '/api/analytics/track',
            '/api/bot/query',
            '/api/chat',
            '/api/cron/cleanup',
            '/api/health',
            '/api/images',
            '/api/knowledge',
            '/api/support/articles/feedback',
            '/api/upload/delivery-photo',
        ],
        actionPrefixes: [
            'admin/',
            'settings/',
            'audit/',
            'core/analytics',
            'core/notifications',
            'core/import',
            'dashboard/',
            'employee/auth',
            'employee/self',
            'product',
            'app/refresh-actions',
        ],
        serviceDirs: [
            'admin',
            'analytics',
            'auth',
            'core',
            'dashboard',
            'settings',
        ],
        uploadPrefixes: ['/api/upload'],
    },
    {
        key: 'HRD',
        label: 'HRD',
        alwaysActive: false,
        workspaceRoots: ['/hrd'],
        permissionRoots: ['/hrd', '/dashboard/employees'],
        landingPath: '/hrd',
        requiredModules: [],
        capabilities: ['MANUFACTURING_WORKFORCE'],
        apiRoutes: [
            '/api/hrd/attendance/export',
            '/api/hrd/bpjs/export',
            '/api/hrd/disciplinary/export',
            '/api/hrd/leave/export',
            '/api/hrd/loans/export',
            '/api/hrd/payroll/export',
            '/api/hrd/payroll-monthly/export',
            '/api/upload/hrd-doc',
            '/api/upload/attendance-photo',
        ],
        actionPrefixes: [
            'hrd/',
            'admin/attendance',
            'admin/employees',
            'admin/work-shifts',
        ],
        serviceDirs: ['hrd'],
        uploadPrefixes: ['/api/upload/hrd-doc', '/api/upload/attendance-photo'],
    },
    {
        key: 'SALES',
        label: 'Sales',
        alwaysActive: false,
        workspaceRoots: ['/sales', '/field'],
        permissionRoots: ['/sales', '/field'],
        landingPath: '/sales',
        requiredModules: [],
        capabilities: [],
        apiRoutes: [],
        actionPrefixes: [
            'sales/',
            'product/product-queries',
            'product/product-mutations',
        ],
        serviceDirs: ['sales'],
        uploadPrefixes: [],
    },
    {
        key: 'PURCHASING',
        label: 'Purchasing',
        alwaysActive: false,
        workspaceRoots: ['/purchasing'],
        permissionRoots: ['/purchasing'],
        landingPath: '/purchasing',
        requiredModules: [],
        capabilities: [],
        apiRoutes: [],
        actionPrefixes: ['purchasing/'],
        serviceDirs: ['purchasing'],
        uploadPrefixes: [],
    },
    {
        key: 'PRODUCTION',
        label: 'Produksi',
        alwaysActive: false,
        workspaceRoots: ['/production', '/kiosk'],
        permissionRoots: ['/production', '/kiosk'],
        landingPath: '/production',
        requiredModules: [],
        capabilities: ['MANUFACTURING_WORKFORCE'],
        apiRoutes: [
            '/api/production/daily-report',
            '/api/upload/production-photo',
        ],
        actionPrefixes: [
            'production/',
            'core/transaction-wizard',
        ],
        serviceDirs: ['production', 'printing'],
        uploadPrefixes: ['/api/upload/production-photo'],
    },
    {
        key: 'INVENTORY',
        label: 'Stok / Gudang',
        alwaysActive: false,
        workspaceRoots: ['/warehouse'],
        permissionRoots: ['/warehouse'],
        landingPath: '/warehouse',
        requiredModules: [],
        capabilities: [],
        apiRoutes: [
            '/api/external/v1/inventory',
        ],
        actionPrefixes: ['inventory/'],
        serviceDirs: ['inventory'],
        uploadPrefixes: [],
    },
    {
        key: 'FINANCE',
        label: 'Finance',
        alwaysActive: false,
        workspaceRoots: ['/finance'],
        permissionRoots: ['/finance'],
        landingPath: '/finance',
        requiredModules: [],
        capabilities: [],
        apiRoutes: [
            '/api/print/invoice',
        ],
        actionPrefixes: ['finance/'],
        serviceDirs: ['finance', 'accounting'],
        uploadPrefixes: [],
    },
    {
        key: 'MAKLON',
        label: 'Maklon',
        alwaysActive: false,
        workspaceRoots: ['/maklon'],
        permissionRoots: ['/maklon', '/dashboard/maklon', '/warehouse/maklon'],
        landingPath: '/maklon',
        requiredModules: [],
        capabilities: [],
        apiRoutes: [],
        actionPrefixes: ['maklon/'],
        serviceDirs: ['maklon'],
        uploadPrefixes: [],
    },
];

// ---------------------------------------------------------------------------
// Package Templates (commercial offerings)
// ---------------------------------------------------------------------------

export const PACKAGE_TEMPLATES: PackageTemplate[] = [
    {
        key: 'HR_CORE',
        label: 'Polyflow HR Core',
        modules: ['CORE', 'HRD'],
    },
    {
        key: 'HR_MANUFACTURING',
        label: 'Polyflow HR Manufacturing',
        modules: ['CORE', 'HRD', 'PRODUCTION'],
        capabilities: ['MANUFACTURING_WORKFORCE'],
    },
    {
        key: 'FINANCE_ONLY',
        label: 'Polyflow Finance',
        modules: ['CORE', 'FINANCE'],
    },
    {
        key: 'OPERATIONS',
        label: 'Polyflow Operations',
        modules: ['CORE', 'PURCHASING', 'PRODUCTION', 'INVENTORY'],
    },
    {
        key: 'ERP_COMPLETE',
        label: 'Polyflow ERP Complete',
        modules: [
            'CORE',
            'HRD',
            'SALES',
            'PURCHASING',
            'PRODUCTION',
            'INVENTORY',
            'FINANCE',
            'MAKLON',
        ],
    },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const _moduleMap = new Map<ModuleKey, ModuleDefinition>(
    MODULE_DEFINITIONS.map((m) => [m.key, m]),
);

const _packageMap = new Map<string, PackageTemplate>(
    PACKAGE_TEMPLATES.map((p) => [p.key, p]),
);

/** Get module definition by key. Throws if not found. */
export function getModule(key: ModuleKey): ModuleDefinition {
    const mod = _moduleMap.get(key);
    if (!mod) throw new Error(`Unknown module key: ${key}`);
    return mod;
}

/** Get all non-core modules. */
export function getBusinessModules(): ModuleDefinition[] {
    return MODULE_DEFINITIONS.filter((m) => !m.alwaysActive);
}

/** Get package template by key. Throws if not found. */
export function getPackage(key: string): PackageTemplate {
    const pkg = _packageMap.get(key);
    if (!pkg) throw new Error(`Unknown package key: ${key}`);
    return pkg;
}

/** Resolve a path to its owning module key, or null if path is CORE-only. */
export function resolvePathToModule(pathname: string): ModuleKey | null {
    // Check longest prefix first
    let best: ModuleKey | null = null;
    let bestLen = 0;
    for (const mod of MODULE_DEFINITIONS) {
        for (const root of mod.workspaceRoots) {
            if (
                (pathname === root || pathname.startsWith(`${root}/`)) &&
                root.length > bestLen
            ) {
                best = mod.key;
                bestLen = root.length;
            }
        }
    }
    return best;
}

/** Resolve a permission key to its owning module key. */
export function resolvePermissionToModule(
    permissionKey: string,
): ModuleKey | null {
    let best: ModuleKey | null = null;
    let bestLen = 0;
    for (const mod of MODULE_DEFINITIONS) {
        for (const root of mod.permissionRoots) {
            if (
                (permissionKey === root ||
                    permissionKey.startsWith(`${root}/`)) &&
                root.length > bestLen
            ) {
                best = mod.key;
                bestLen = root.length;
            }
        }
    }
    return best;
}

/** Check whether all required modules for a given module are present. */
export function satisfiesDependencies(
    moduleKey: ModuleKey,
    activeModules: ModuleKey[],
): boolean {
    const mod = getModule(moduleKey);
    return mod.requiredModules.every((req) => activeModules.includes(req));
}

/** Get all module keys required by a package. */
export function expandPackageModules(packageKey: string): ModuleKey[] {
    const pkg = getPackage(packageKey);
    const allModules = new Set(pkg.modules);

    // Expand dependencies
    let changed = true;
    while (changed) {
        changed = false;
        for (const mk of allModules) {
            const mod = getModule(mk);
            for (const req of mod.requiredModules) {
                if (!allModules.has(req)) {
                    allModules.add(req);
                    changed = true;
                }
            }
        }
    }

    return Array.from(allModules);
}

/** Validate a set of module keys. Returns invalid keys. */
export function validateModuleKeys(
    keys: string[],
): { valid: ModuleKey[]; invalid: string[] } {
    const valid: ModuleKey[] = [];
    const invalid: string[] = [];
    for (const k of keys) {
        if (_moduleMap.has(k as ModuleKey)) {
            valid.push(k as ModuleKey);
        } else {
            invalid.push(k);
        }
    }
    return { valid, invalid };
}

/** All valid module keys for type narrowing in tests. */
export const ALL_MODULE_KEYS: ModuleKey[] = MODULE_DEFINITIONS.map(
    (m) => m.key,
);

// ---------------------------------------------------------------------------
// Workspace-to-module resolution
// ---------------------------------------------------------------------------

const _workspaceToModule = new Map<string, ModuleKey>();
for (const mod of MODULE_DEFINITIONS) {
    for (const root of mod.workspaceRoots) {
        _workspaceToModule.set(root, mod.key);
    }
}

/** Resolve a workspace key (e.g. "hrd", "sales") to its ModuleKey. */
export function resolveWorkspaceToModule(
    workspace: string,
): ModuleKey | null {
    const root = workspace.startsWith('/') ? workspace : `/${workspace}`;
    return _workspaceToModule.get(root) ?? null;
}

/**
 * Resolve a pathname to its module key via workspace roots.
 * Falls back to permission resolution for paths not under a workspace root.
 */
export function resolvePathToModuleKey(pathname: string): ModuleKey | null {
    // Try workspace root first
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
        const workspaceRoot = `/${segments[0]}`;
        const wk = _workspaceToModule.get(workspaceRoot);
        if (wk) return wk;
    }
    // Fallback to full path resolution
    return resolvePathToModule(pathname);
}
