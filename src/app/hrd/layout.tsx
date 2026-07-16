import { auth } from '@/auth';
import { getMyPermissions } from '@/actions/admin/permissions';
import { PathBreadCrumb } from '@/components/layout/path-breadcrumb';
import { SidebarSpacer } from '@/components/layout/sidebar-spacer';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { redirect } from 'next/navigation';

export default async function HrdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const user = {
    name: session.user?.name,
    email: session.user?.email,
    role: (session.user as { role?: string }).role || 'WAREHOUSE',
  };

  const permissionsRes = await getMyPermissions();
  const sessionAllowed = (session.user as { allowedResources?: string[] })?.allowedResources || [];
  const permissions = permissionsRes.success && permissionsRes.data
    ? permissionsRes.data
    : (sessionAllowed.length > 0 ? sessionAllowed : []);

  return (
    <div className="min-h-screen bg-secondary/30">
      <SidebarNav user={user} permissions={permissions} />
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
