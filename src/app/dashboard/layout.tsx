import { auth } from '@/auth';
import { getMyPermissions } from '@/actions/admin/permissions';
import { PathBreadCrumb } from '@/components/layout/path-breadcrumb';
import { SidebarSpacer } from '@/components/layout/sidebar-spacer';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@/lib/core/prisma';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session) {
        redirect('/login');
    }

    // "Log out of all devices" support: the JWT carries a tokenVersion snapshot
    // from login. If the user has since incremented it (via settings), older
    // tokens are stale and must be signed out. Checked here in the Node runtime
    // (not in the Edge middleware) to keep Prisma out of the edge callbacks.
    const sessionUserId = (session.user as { id?: string })?.id;
    const sessionTokenVersion = (session.user as { tokenVersion?: number })?.tokenVersion;
    if (sessionUserId && typeof sessionTokenVersion === 'number') {
        try {
            const dbUser = await prisma.user.findUnique({
                where: { id: sessionUserId },
                select: { tokenVersion: true },
            });
            if (dbUser && dbUser.tokenVersion !== sessionTokenVersion) {
                redirect('/logout');
            }
        } catch (err) {
            // Never hard-fail navigation on a transient DB hiccup; redirect() throws
            // NEXT_REDIRECT which must propagate.
            if (err && typeof err === 'object' && 'digest' in err) throw err;
        }
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
