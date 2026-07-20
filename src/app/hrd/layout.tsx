import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HrdSidebar } from "@/components/hrd/hrd-sidebar";
import {
  canAccessWorkspace,
  getPreferredWorkspaceLanding,
  hasWorkspaceResourceAccess,
  isPathAllowedByResources,
} from "@/lib/auth/access-policy";
import { PathBreadCrumb } from "@/components/layout/path-breadcrumb";
import { SidebarSpacer } from "@/components/layout/sidebar-spacer";
import { getMyPermissions } from "@/actions/admin/permissions";
import { headers } from "next/headers";

export default async function HrdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const reqHeaders = await headers();
  const pathname = reqHeaders.get("x-pathname") || "/hrd";

  const permissionsRes = await getMyPermissions();
  const sessionAllowed =
    (session.user as { allowedResources?: string[] })?.allowedResources || [];
  const permissions: string[] | "ALL" =
    permissionsRes.success && permissionsRes.data
      ? permissionsRes.data
      : sessionAllowed.length > 0
        ? sessionAllowed
        : [];

  const userForPolicy = {
    ...session.user,
    allowedResources:
      permissions === "ALL" ? sessionAllowed : (permissions as string[]),
  };

  if (!canAccessWorkspace(userForPolicy, "hrd", pathname)) {
    redirect("/dashboard?error=Unauthorized");
  }

  if (!hasWorkspaceResourceAccess(permissions, "hrd")) {
    redirect("/dashboard?error=Unauthorized");
  }

  if (
    pathname === "/hrd" &&
    permissions !== "ALL" &&
    !permissions.includes("/hrd")
  ) {
    redirect(getPreferredWorkspaceLanding("hrd", permissions));
  }

  // Defense in depth: deny deep paths not covered by any granted resource
  if (
    permissions !== "ALL" &&
    pathname !== "/hrd" &&
    !isPathAllowedByResources(pathname, permissions)
  ) {
    redirect(getPreferredWorkspaceLanding("hrd", permissions));
  }

  return (
    <div className="min-h-screen bg-background">
      <HrdSidebar user={session.user} permissions={permissions} />
      <SidebarSpacer>
        <main className="min-h-screen">
          <div className="p-4 md:p-6 lg:p-8">
            <PathBreadCrumb />
            {children}
          </div>
        </main>
      </SidebarSpacer>
    </div>
  );
}
