export type WorkspaceKey =
  | 'admin'
  | 'dashboard'
  | 'warehouse'
  | 'production'
  | 'finance'
  | 'sales'
  | 'planning';

/**
 * Defines the roles permitted to access each workspace area.
 */
export const WORKSPACE_ACCESS_POLICY: Record<WorkspaceKey, readonly string[]> = {
  admin: ['SUPER_ADMIN'],
  dashboard: ['ADMIN', 'FINANCE', 'SALES', 'PLANNING', 'PROCUREMENT', 'WAREHOUSE', 'PRODUCTION'],
  warehouse: ['ADMIN', 'WAREHOUSE', 'PRODUCTION', 'PLANNING'],
  production: ['ADMIN', 'PRODUCTION', 'PLANNING'],
  finance: ['ADMIN', 'FINANCE'],
  sales: ['ADMIN', 'SALES'],
  planning: ['ADMIN', 'PLANNING', 'PROCUREMENT'],
} as const;

/**
 * Extracts the workspace key from a URL pathname.
 */
export function getWorkspaceFromPath(pathname: string): WorkspaceKey | null {
  const parts = pathname.split('/');
  const workspaceCandidate = parts[1];
  if (
    workspaceCandidate &&
    ['admin', 'dashboard', 'warehouse', 'production', 'finance', 'sales', 'planning'].includes(
      workspaceCandidate
    )
  ) {
    return workspaceCandidate as WorkspaceKey;
  }
  return null;
}

/**
 * Checks if a user has permission to access a workspace.
 */
export function canAccessWorkspace(
  user: { role?: string; isSuperAdmin?: boolean } | null | undefined,
  workspace: WorkspaceKey
): boolean {
  if (!user) return false;

  const role = user.role?.toUpperCase();
  const isSuperAdmin = !!user.isSuperAdmin;

  // 1. Super Admin is strictly isolated to admin workspace
  if (isSuperAdmin) {
    return workspace === 'admin';
  }

  // 2. Tenant users cannot access admin workspace
  if (workspace === 'admin') {
    return false;
  }

  // 3. Tenant Admin can access all tenant workspaces
  if (role === 'ADMIN') {
    return true;
  }

  // 4. Warehouse is strictly isolated to warehouse workspace
  if (role === 'WAREHOUSE') {
    return workspace === 'warehouse';
  }

  // 5. Production is strictly isolated to production workspace
  if (role === 'PRODUCTION') {
    return workspace === 'production';
  }

  // 6. Other roles check policy mapping
  const allowed = WORKSPACE_ACCESS_POLICY[workspace];
  return allowed ? allowed.includes(role || '') : false;
}

/**
 * Resolves the default/home workspace landing page for a user.
 */
export function getDefaultRedirectForUser(user: { role?: string; isSuperAdmin?: boolean }): string {
  const role = user.role?.toUpperCase();
  const isSuperAdmin = !!user.isSuperAdmin;

  if (isSuperAdmin) return '/admin/super-admin';
  if (role === 'WAREHOUSE') return '/warehouse';
  if (role === 'PRODUCTION') return '/production';
  return '/dashboard';
}
