import { auth } from '@/auth';
import { getMyPermissions } from '@/actions/admin/permissions';
import { PathBreadCrumb } from '@/components/layout/path-breadcrumb';
import { SidebarSpacer } from '@/components/layout/sidebar-spacer';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

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
    // Fallback: use session's allowedResources (set at login from tenant DB) when server action fails
    const sessionAllowed = (session.user as { allowedResources?: string[] })?.allowedResources || [];
    const permissions = permissionsRes.success && permissionsRes.data
        ? permissionsRes.data
        : (sessionAllowed.length > 0 ? sessionAllowed : []);
    const reqHeaders = await headers();
    const pathname = reqHeaders.get('x-pathname') || '/dashboard';

    if (permissions !== 'ALL') {
        const canAccessCurrentDashboardPath =
            pathname === '/dashboard'
                ? permissions.includes('/dashboard')
                : permissions.some((resource) => pathname === resource || pathname.startsWith(`${resource}/`));

        if (!canAccessCurrentDashboardPath) {
            redirect(permissions.find((resource) => resource.startsWith('/')) || '/login');
        }
    }

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
