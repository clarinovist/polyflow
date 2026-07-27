import { getUserRoles } from '@/lib/auth/roles';
import { resolveWorkspaceToModule } from '@/lib/modules/module-registry';
import { getEntitlementsFromContext } from '@/lib/core/prisma';

export type WorkspaceKey =
    | 'admin'
    | 'dashboard'
    | 'warehouse'
    | 'production'
    | 'finance'
    | 'sales'
    | 'purchasing'
    | 'hrd'
    | 'maklon';

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
    const activeModules = getEntitlementsFromContext();
    if (!activeModules) return true; // no context (super admin / non-tenant), allow

    return activeModules.includes(moduleKey);
}

/**
 * Resolves the active module keys for a tenant from the request context.
 * Returns the cached list from resolveTenantContext(). No additional DB queries.
 * Falls back to empty array when no context.
 */
export function getTenantActiveModules(): string[] {
    return getEntitlementsFromContext() ?? [];
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
    } as const;

/**
 * Extracts the workspace key from a URL pathname.
 */
export function getWorkspaceFromPath(pathname: string): WorkspaceKey | null {
    const parts = pathname.split('/');
    const workspaceCandidate = parts[1];
    if (
        workspaceCandidate &&
        [
            'admin',
            'dashboard',
            'warehouse',
            'production',
            'finance',
            'sales',
            'purchasing',
            'hrd',
            'maklon',
        ].includes(workspaceCandidate)
    ) {
        return workspaceCandidate as WorkspaceKey;
    }
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
