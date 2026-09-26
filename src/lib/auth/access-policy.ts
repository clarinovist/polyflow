import { getUserRoles } from '@/lib/auth/roles';
import { resolveWorkspaceToModule, MODULE_DEFINITIONS } from '@/lib/modules/module-registry';

type EntitlementContextReader = {
    getStore: () => string[] | undefined;
};

const globalForEntitlementContext = globalThis as unknown as {
    __polyflowEntitlementContext?: EntitlementContextReader;
};

function getEntitlementsFromGlobalContext(): string[] | undefined {
    return globalForEntitlementContext.__polyflowEntitlementContext?.getStore();
}

export type WorkspaceKey =
    | 'admin'
    | 'dashboard'
    | 'warehouse'
    | 'production'
    | 'finance'
    | 'sales'
    | 'purchasing'
    | 'hrd'
    | 'maklon'
    | 'distribution';

/**
 * Checks if a tenant has an active entitlement for the module that owns a
 * workspace. Returns true if entitled or if the module is always-active (CORE).
 * Returns false if the tenant does not own the module.
 *
 * Reads from the request-scoped entitlement context (populated once per request
 * in resolveTenantContext()). No additional DB queries.
 */
export function hasWorkspaceEntitlement(
    workspace: WorkspaceKey,
): boolean {
    const moduleKey = resolveWorkspaceToModule(workspace);
    if (!moduleKey) return true; // unknown workspace, let role policy decide
    if (moduleKey === 'CORE') return true;

    // Read from request-scoped context (no DB query)
    const activeModules = getEntitlementsFromGlobalContext();
    if (!activeModules) return true; // no context (super admin / non-tenant), allow

    return activeModules.includes(moduleKey);
}

/**
 * Resolves the active module keys for a tenant from the request context.
 * Returns the cached list from resolveTenantContext(). No additional DB queries.
 * Falls back to empty array when no context.
 */
export function getTenantActiveModules(): string[] {
    return getEntitlementsFromGlobalContext() ?? [];
}

/**
 * Defines the roles permitted to access each workspace area.
 */
export const WORKSPACE_ACCESS_POLICY: Record<WorkspaceKey, readonly string[]> =
    {
        admin: ['SUPER_ADMIN'],
        dashboard: [
            'ADMIN',
            'FINANCE',
            'SALES',
            'PLANNING',
            'PROCUREMENT',
            'WAREHOUSE',
            'PRODUCTION',
            'HRD',
        ],
        warehouse: ['ADMIN', 'WAREHOUSE', 'PRODUCTION', 'PLANNING'],
        production: ['ADMIN', 'PRODUCTION', 'PLANNING', 'PROCUREMENT'],
        finance: ['ADMIN', 'FINANCE'],
        sales: ['ADMIN', 'SALES', 'MARKETING'],
        // planning merged into production
        purchasing: ['ADMIN', 'PROCUREMENT', 'PLANNING'],
        // HRD: admin + finance + hrd role
        hrd: ['ADMIN', 'FINANCE', 'HRD'],
        // Maklon portal: admin + procurement/planning; warehouse keeps /warehouse/maklon aliases
        maklon: ['ADMIN', 'PROCUREMENT', 'PLANNING'],
        // Distributor portal: admin + sales/marketing; alur beli-jual-kirim-tagih
        distribution: ['ADMIN', 'SALES', 'MARKETING', 'PROCUREMENT'],
    } as const;

/**
 * Set of valid workspace segments derived from MODULE_DEFINITIONS[].workspaceRoots,
 * minus sub-workspace aliases (e.g. '/field' is SALES but the workspace key
 * is 'sales', not 'field').
 */
const VALID_WORKSPACE_SEGMENTS = new Set<string>();
for (const mod of MODULE_DEFINITIONS) {
    for (const root of mod.workspaceRoots) {
        // Only take top-level segments that match WorkspaceKey union
        // (e.g. '/sales', '/hrd' — not '/field' or '/kiosk' which are aliases)
        const segment = root.slice(1); // remove leading '/'
        if (segment && !VALID_WORKSPACE_SEGMENTS.has(segment)) {
            // Map alias segments to their primary workspace key
            if (segment === 'field') {
                VALID_WORKSPACE_SEGMENTS.add('sales');
            } else if (segment === 'kiosk') {
                VALID_WORKSPACE_SEGMENTS.add('production');
            } else {
                VALID_WORKSPACE_SEGMENTS.add(segment);
            }
        }
    }
}

/**
 * Extracts the workspace key from a URL pathname.
 */
export function getWorkspaceFromPath(pathname: string): WorkspaceKey | null {
    const parts = pathname.split('/');
    const workspaceCandidate = parts[1];
    if (
        workspaceCandidate &&
        VALID_WORKSPACE_SEGMENTS.has(workspaceCandidate)
    ) {
        return workspaceCandidate as WorkspaceKey;
    }
    // Handle sub-workspace aliases (e.g. /field → 'sales', /kiosk → 'production')
    if (workspaceCandidate === 'field') return 'sales';
    if (workspaceCandidate === 'kiosk') return 'production';
    return null;
}

/**
 * True when resources grant any access under a workspace root
 * (e.g. `/warehouse` or `/warehouse/inventory`).
 */
export function hasWorkspaceResourceAccess(
    resources: string[] | 'ALL' | null | undefined,
    workspace: WorkspaceKey | string,
): boolean {
    if (resources === 'ALL') return true;
    if (!resources?.length) return false;
    const root = workspace.startsWith('/') ? workspace : `/${workspace}`;
    return resources.some((res) => res === root || res.startsWith(`${root}/`));
}

/**
 * Path coverage for rolePermission resources:
 * - exact match
 * - parent resource grants children (`/warehouse` → `/warehouse/inventory`)
 * - workspace root is reachable when any nested resource exists
 *   (`/warehouse/inventory` → may enter `/warehouse` for landing redirect)
 */
export function isPathAllowedByResources(
    pathname: string,
    resources: string[] | 'ALL' | null | undefined,
): boolean {
    if (resources === 'ALL') return true;
    if (!resources?.length) return false;

    const segments = pathname.split('/').filter(Boolean);
    const isWorkspaceRoot = segments.length === 1;

    return resources.some((res) => {
        if (pathname === res || pathname.startsWith(`${res}/`)) return true;
        // Nested permission grants entry at workspace root (layout/landing only)
        if (isWorkspaceRoot && res.startsWith(`${pathname}/`)) return true;
        return false;
    });
}

/**
 * Preferred landing path inside a workspace given granted resources.
 * Used when user may open the workspace root but only has nested perms.
 */
export function getPreferredWorkspaceLanding(
    workspace: WorkspaceKey,
    resources: string[] | 'ALL',
): string {
    const root = `/${workspace}`;
    if (resources === 'ALL' || resources.includes(root)) return root;

    if (workspace === 'warehouse') {
        if (
            resources.some(
                (r) =>
                    r === '/warehouse/inventory' ||
                    r.startsWith('/warehouse/inventory/'),
            )
        ) {
            return '/warehouse/inventory';
        }
    }

    const nested = resources
        .filter((r) => r.startsWith(`${root}/`))
        .sort((a, b) => a.length - b.length);
    return nested[0] ?? root;
}

/**
 * Workspace roots that navigation surfaces link to directly. Aliases
 * ('/field', '/kiosk') and non-sidebar roots ('/admin', '/dashboard',
 * '/support', '/my') are excluded.
 */
const NAVIGABLE_WORKSPACE_ROOTS: readonly string[] = Array.from(
    new Set(
        MODULE_DEFINITIONS.flatMap((mod) => mod.workspaceRoots).filter(
            (root) =>
                /^\/[a-z]+$/.test(root) &&
                !['/admin', '/dashboard', '/support', '/my', '/field', '/kiosk'].includes(
                    root,
                ),
        ),
    ),
);

/**
 * Direct entry href for each workspace root the user may enter but only
 * through nested grants.
 *
 * A workspace-root link (/purchasing) is redirected by the workspace layout to
 * the preferred landing page. Linking straight to that landing removes a
 * redirect hop from every click and — more importantly — from every prefetch,
 * which otherwise renders the full landing page on the server for a link the
 * user never opened. Resolution matches the layout by construction: both use
 * `getPreferredWorkspaceLanding`.
 *
 * Roots the user can open directly, and roots they cannot access at all, are
 * left untouched.
 */
export function buildWorkspaceEntryHrefs(
    permissions: string[] | 'ALL' | null | undefined,
): Record<string, string> {
    if (!permissions || permissions === 'ALL') return {};

    const hrefs: Record<string, string> = {};
    for (const root of NAVIGABLE_WORKSPACE_ROOTS) {
        if (permissions.includes(root)) continue;
        if (!hasWorkspaceResourceAccess(permissions, root.slice(1))) continue;

        const landing = getPreferredWorkspaceLanding(
            root.slice(1) as WorkspaceKey,
            permissions,
        );
        if (landing !== root) hrefs[root] = landing;
    }
    return hrefs;
}

/**
 * Checks if a user has permission to access a workspace.
 *
 * Role policy is the primary gate. Access Control matrix entries
 * (`allowedResources` / rolePermission) can grant cross-role module access
 * (e.g. SALES + `/warehouse` for stok).
 */
export function canAccessWorkspace(
    user:
        | {
              role?: string;
              roles?: string[];
              isSuperAdmin?: boolean;
              allowedResources?: string[];
          }
        | null
        | undefined,
    workspace: WorkspaceKey,
    pathname?: string,
): boolean {
    if (!user) return false;

    const allRoles = getUserRoles(user);
    const isSuperAdmin = !!user.isSuperAdmin;
    const resources = user.allowedResources;

    // 1. Super Admin is strictly isolated to admin workspace
    if (isSuperAdmin) {
        return workspace === 'admin';
    }

    // 2. Tenant users cannot access admin workspace
    if (workspace === 'admin') {
        return false;
    }

    // 3. Tenant Admin can access all tenant workspaces
    if (allRoles.includes('ADMIN')) {
        return true;
    }

    const resourceAllowsWorkspace = (): boolean => {
        if (!hasWorkspaceResourceAccess(resources, workspace)) return false;
        if (!pathname) return true;
        return isPathAllowedByResources(pathname, resources);
    };

    // Strictly isolate WAREHOUSE and PRODUCTION if they are the only assigned roles
    const nonIsolatedRoles = allRoles.filter(
        (r) => r !== 'WAREHOUSE' && r !== 'PRODUCTION',
    );
    if (nonIsolatedRoles.length === 0) {
        if (workspace === 'warehouse' && allRoles.includes('WAREHOUSE'))
            return true;
        if (workspace === 'production' && allRoles.includes('PRODUCTION'))
            return true;
        // Cross-workspace only via explicit resource grants (e.g. products master)
        if (pathname && isPathAllowedByResources(pathname, resources))
            return true;
        if (!pathname && resourceAllowsWorkspace()) return true;
        return false;
    }

    // 4. Role policy for this workspace
    const policyRoles = WORKSPACE_ACCESS_POLICY[workspace];
    if (policyRoles?.some((r) => allRoles.includes(r))) {
        return true;
    }

    // 5. Access Control matrix: module/resource grant (SALES → stok, etc.)
    return resourceAllowsWorkspace();
}

/**
 * Resolves the default/home workspace landing page for a user.
 * Entitlement-aware: if the user's role-based landing is in a module
 * they don't own, falls back to /dashboard.
 */
export function getDefaultRedirectForUser(user: {
    role?: string;
    roles?: string[];
    isSuperAdmin?: boolean;
}): string {
    const activeRole = user.role?.toUpperCase();
    const isSuperAdmin = !!user.isSuperAdmin;

    // Short URL alias: admin.polyflow.uk/super-admin is rewritten (internally, by
    // proxy.ts) to /admin/super-admin. Redirecting here keeps the address bar short.
    if (isSuperAdmin) return '/super-admin';

    // Role-based landing with entitlement check
    const roleLandingMap: Record<string, WorkspaceKey> = {
        WAREHOUSE: 'warehouse',
        PRODUCTION: 'production',
        HRD: 'hrd',
        PROCUREMENT: 'purchasing',
        PLANNING: 'production',
        MARKETING: 'sales',
        // Kepala pabrik lands on the production portal; workspace entry relies
        // on explicit resource grants (not a blanket workspace policy) so
        // /production/costing stays closed.
        FACTORY_MANAGER: 'production',
    };

    if (activeRole && roleLandingMap[activeRole]) {
        const targetWorkspace = roleLandingMap[activeRole];
        if (hasWorkspaceEntitlement(targetWorkspace)) {
            return `/${targetWorkspace}`;
        }
        // Module not entitled — fall through to /dashboard
    }

    return '/dashboard';
}
