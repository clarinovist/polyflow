import { auth } from '@/auth';
import { getMyPermissions } from '@/actions/admin/permissions';
import { PathBreadCrumb } from '@/components/layout/path-breadcrumb';
import { SidebarSpacer } from '@/components/layout/sidebar-spacer';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
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

    // Fetch permissions for the sidebar
    // Admin gets 'ALL' by default from the action logic, but let's be explicit if needed
    // The getMyPermissions action handles the 'ALL' logic for admins.
    const permissionsRes = await getMyPermissions();
    const permissions = permissionsRes.success && permissionsRes.data ? permissionsRes.data : [];

    return (
        <div className="min-h-screen bg-secondary/30">
            <SidebarNav user={user} permissions={permissions} />

            {/* Main Content */}
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
