import { getUserRoles } from "@/lib/auth/roles";

export type WorkspaceKey =
  | "admin"
  | "dashboard"
  | "warehouse"
  | "production"
  | "finance"
  | "sales"
  | "purchasing"
  | "hrd"
  | "maklon";

/**
 * Defines the roles permitted to access each workspace area.
 */
export const WORKSPACE_ACCESS_POLICY: Record<WorkspaceKey, readonly string[]> =
  {
    admin: ["SUPER_ADMIN"],
    dashboard: [
      "ADMIN",
      "FINANCE",
      "SALES",
      "PLANNING",
      "PROCUREMENT",
      "WAREHOUSE",
      "PRODUCTION",
    ],
    warehouse: ["ADMIN", "WAREHOUSE", "PRODUCTION", "PLANNING"],
    production: ["ADMIN", "PRODUCTION", "PLANNING", "PROCUREMENT"],
    finance: ["ADMIN", "FINANCE"],
    sales: ["ADMIN", "SALES"],
    // planning merged into production
    purchasing: ["ADMIN", "PROCUREMENT", "PLANNING"],
    // HRD: admin + finance (aligned with requireHrdFinance / requireHrdApprover)
    hrd: ["ADMIN", "FINANCE"],
    // Maklon portal: admin + procurement/planning; warehouse keeps /warehouse/maklon aliases
    maklon: ["ADMIN", "PROCUREMENT", "PLANNING"],
  } as const;

/**
 * Extracts the workspace key from a URL pathname.
 */
export function getWorkspaceFromPath(pathname: string): WorkspaceKey | null {
  const parts = pathname.split("/");
  const workspaceCandidate = parts[1];
  if (
    workspaceCandidate &&
    [
      "admin",
      "dashboard",
      "warehouse",
      "production",
      "finance",
      "sales",
      "purchasing",
      "hrd",
      "maklon",
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
  resources: string[] | "ALL" | null | undefined,
  workspace: WorkspaceKey | string,
): boolean {
  if (resources === "ALL") return true;
  if (!resources?.length) return false;
  const root = workspace.startsWith("/") ? workspace : `/${workspace}`;
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
  resources: string[] | "ALL" | null | undefined,
): boolean {
  if (resources === "ALL") return true;
  if (!resources?.length) return false;

  const segments = pathname.split("/").filter(Boolean);
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
  resources: string[] | "ALL",
): string {
  const root = `/${workspace}`;
  if (resources === "ALL" || resources.includes(root)) return root;

  if (workspace === "warehouse") {
    if (
      resources.some(
        (r) => r === "/warehouse/inventory" || r.startsWith("/warehouse/inventory/"),
      )
    ) {
      return "/warehouse/inventory";
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
  user: {
    role?: string;
    roles?: string[];
    isSuperAdmin?: boolean;
    allowedResources?: string[];
  } | null | undefined,
  workspace: WorkspaceKey,
  pathname?: string,
): boolean {
  if (!user) return false;

  const allRoles = getUserRoles(user);
  const isSuperAdmin = !!user.isSuperAdmin;
  const resources = user.allowedResources;

  // 1. Super Admin is strictly isolated to admin workspace
  if (isSuperAdmin) {
    return workspace === "admin";
  }

  // 2. Tenant users cannot access admin workspace
  if (workspace === "admin") {
    return false;
  }

  // 3. Tenant Admin can access all tenant workspaces
  if (allRoles.includes("ADMIN")) {
    return true;
  }

  const resourceAllowsWorkspace = (): boolean => {
    if (!hasWorkspaceResourceAccess(resources, workspace)) return false;
    if (!pathname) return true;
    return isPathAllowedByResources(pathname, resources);
  };

  // Strictly isolate WAREHOUSE and PRODUCTION if they are the only assigned roles
  const nonIsolatedRoles = allRoles.filter(
    (r) => r !== "WAREHOUSE" && r !== "PRODUCTION",
  );
  if (nonIsolatedRoles.length === 0) {
    if (workspace === "warehouse" && allRoles.includes("WAREHOUSE")) return true;
    if (workspace === "production" && allRoles.includes("PRODUCTION")) return true;
    // Cross-workspace only via explicit resource grants (e.g. products master)
    if (pathname && isPathAllowedByResources(pathname, resources)) return true;
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
  if (isSuperAdmin) return "/super-admin";
  // Active role drives post-login landing (selected at login)
  if (activeRole === "WAREHOUSE") return "/warehouse";
  if (activeRole === "PRODUCTION") return "/production";
  return "/dashboard";
}
