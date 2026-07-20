import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PurchasingSidebar } from "@/components/purchasing/purchasing-sidebar";
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

export default async function PurchasingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const reqHeaders = await headers();
  const pathname = reqHeaders.get("x-pathname") || "/purchasing";

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

  if (!canAccessWorkspace(userForPolicy, "purchasing", pathname)) {
    redirect("/dashboard?error=Unauthorized");
  }

  if (!hasWorkspaceResourceAccess(permissions, "purchasing")) {
    redirect("/dashboard?error=Unauthorized");
  }

  // Nested-only grants: bounce root → preferred page
  if (
    pathname === "/purchasing" &&
    permissions !== "ALL" &&
    !permissions.includes("/purchasing")
  ) {
    redirect(getPreferredWorkspaceLanding("purchasing", permissions));
  }

  // Defense in depth: deny deep paths not covered by any granted resource
  if (
    permissions !== "ALL" &&
    pathname !== "/purchasing" &&
    !isPathAllowedByResources(pathname, permissions)
  ) {
    redirect(getPreferredWorkspaceLanding("purchasing", permissions));
  }

  return (
    <div className="min-h-screen bg-background">
      <PurchasingSidebar user={session.user} permissions={permissions} />
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
