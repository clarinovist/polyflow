import { getUserRoles } from "@/lib/auth/roles";

export type WorkspaceKey =
  | "admin"
  | "dashboard"
  | "warehouse"
  | "production"
  | "finance"
  | "sales"
  | "purchasing";

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
    ].includes(workspaceCandidate)
  ) {
    return workspaceCandidate as WorkspaceKey;
  }
  return null;
}

/**
 * Checks if a user has permission to access a workspace.
 */
export function canAccessWorkspace(
  user: { role?: string; roles?: string[]; isSuperAdmin?: boolean; allowedResources?: string[] } | null | undefined,
  workspace: WorkspaceKey,
  pathname?: string,
): boolean {
  if (!user) return false;

  const allRoles = getUserRoles(user);
  const isSuperAdmin = !!user.isSuperAdmin;

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

  // Strictly isolate WAREHOUSE and PRODUCTION if they are the only assigned roles
  const nonIsolatedRoles = allRoles.filter(r => r !== "WAREHOUSE" && r !== "PRODUCTION");
  if (nonIsolatedRoles.length === 0) {
    if (workspace === "warehouse" && allRoles.includes("WAREHOUSE")) return true;
    if (workspace === "production" && allRoles.includes("PRODUCTION")) return true;
    if (
      pathname &&
      user.allowedResources?.some(
        (res) => pathname === res || pathname.startsWith(`${res}/`),
      )
    ) {
      return true;
    }
    return false;
  }

  // 4. Workspace-specific gates (aligned with WORKSPACE_ACCESS_POLICY)
  if (workspace === "warehouse") {
    const warehouseRoles = ["WAREHOUSE", "PRODUCTION", "PLANNING"];
    if (allRoles.some((r) => warehouseRoles.includes(r))) return true;
    if (
      pathname &&
      user.allowedResources?.some(
        (res) => pathname === res || pathname.startsWith(`${res}/`),
      )
    ) {
      return true;
    }
    return false;
  }

  if (workspace === "production") {
    const productionRoles = ["PRODUCTION", "PLANNING", "PROCUREMENT"];
    if (allRoles.some((r) => productionRoles.includes(r))) return true;
    if (
      pathname &&
      user.allowedResources?.some(
        (res) => pathname === res || pathname.startsWith(`${res}/`),
      )
    ) {
      return true;
    }
    return false;
  }

  // 5. Other workspaces: ANY role in policy
  const allowed = WORKSPACE_ACCESS_POLICY[workspace];
  if (!allowed) return false;
  return allRoles.some((r) => allowed.includes(r));
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

  // Short URL alias: admin.polyflow.uk/dashboard is rewritten (internally, by
  // proxy.ts) to /admin/super-admin. Redirecting here keeps the address bar short.
  if (isSuperAdmin) return "/dashboard";
  // Active role drives post-login landing (selected at login)
  if (activeRole === "WAREHOUSE") return "/warehouse";
  if (activeRole === "PRODUCTION") return "/production";
  return "/dashboard";
}
