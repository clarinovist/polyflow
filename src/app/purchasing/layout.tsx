import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PurchasingSidebar } from "@/components/purchasing/purchasing-sidebar";
import { canAccessWorkspace } from "@/lib/auth/access-policy";
import { PathBreadCrumb } from "@/components/layout/path-breadcrumb";
import { SidebarSpacer } from "@/components/layout/sidebar-spacer";
import { getMyPermissions } from "@/actions/admin/permissions";

export default async function PurchasingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessWorkspace(session.user, "purchasing")) {
    redirect("/dashboard?error=Unauthorized");
  }

  const permissionsRes = await getMyPermissions();
  const permissions =
    permissionsRes.success && permissionsRes.data ? permissionsRes.data : [];
  if (permissions !== "ALL" && !permissions.includes("/purchasing")) {
    redirect("/dashboard?error=Unauthorized");
  }

  return (
    <div className="min-h-screen bg-background">
      <PurchasingSidebar user={session.user} />
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
