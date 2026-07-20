import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MaklonSidebar } from "@/components/maklon/maklon-sidebar";
import { canAccessWorkspace } from "@/lib/auth/access-policy";
import { PathBreadCrumb } from "@/components/layout/path-breadcrumb";
import { SidebarSpacer } from "@/components/layout/sidebar-spacer";
import { getMyPermissions } from "@/actions/admin/permissions";

export default async function MaklonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!canAccessWorkspace(session.user, "maklon")) {
    redirect("/dashboard?error=Unauthorized");
  }

  const permissionsRes = await getMyPermissions();
  const permissions =
    permissionsRes.success && permissionsRes.data ? permissionsRes.data : [];
  if (permissions !== "ALL" && !permissions.includes("/maklon")) {
    redirect("/dashboard?error=Unauthorized");
  }

  return (
    <div className="min-h-screen bg-background">
      <MaklonSidebar user={session.user} />
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
