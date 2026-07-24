import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ProductionSidebar } from '@/components/production/production-sidebar';
import { ClockDisplay } from '../kiosk/ClockDisplay';
import {
    canAccessWorkspace,
    getPreferredWorkspaceLanding,
    hasWorkspaceResourceAccess,
    isPathAllowedByResources,
} from '@/lib/auth/access-policy';
import { PathBreadCrumb } from '@/components/layout/path-breadcrumb';
import { SidebarSpacer } from '@/components/layout/sidebar-spacer';
import { getMyPermissions } from '@/actions/admin/permissions';
import { headers } from 'next/headers';

export default async function ProductionLayout({
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
        role: (session.user as { role?: string }).role || 'PRODUCTION',
        image: session.user?.image,
    };

    const reqHeaders = await headers();
    const pathname = reqHeaders.get('x-pathname') || '/production';

    const permissionsRes = await getMyPermissions();
    const sessionAllowed =
        (session.user as { allowedResources?: string[] })?.allowedResources || [];
    const permissions: string[] | 'ALL' =
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

    if (!canAccessWorkspace(userForPolicy, 'production', pathname)) {
        redirect('/dashboard');
    }

    if (!hasWorkspaceResourceAccess(permissions, 'production')) {
        redirect('/dashboard');
    }

    // Nested-only grants: bounce root → preferred page
    if (
        pathname === '/production' &&
        permissions !== 'ALL' &&
        !permissions.includes('/production')
    ) {
        redirect(getPreferredWorkspaceLanding('production', permissions));
    }

    // Defense in depth: deny deep paths not covered by any granted resource
    if (
        permissions !== 'ALL' &&
        pathname !== '/production' &&
        !isPathAllowedByResources(pathname, permissions)
    ) {
        redirect(getPreferredWorkspaceLanding('production', permissions));
    }

    return (
        <div className="min-h-screen bg-background flex">
            <ProductionSidebar user={user} permissions={permissions} />

            <SidebarSpacer className="flex-1 flex flex-col min-h-screen">
                <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur-md px-6 h-16 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <div>
                            <h1 className="text-md font-bold text-foreground">Portal Produksi</h1>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Floor Control Mode</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <ClockDisplay />
                    </div>
                </header>

                <main className="flex-1 overflow-auto bg-muted/20 p-6">
                    <PathBreadCrumb />
                    {children}
                </main>
            </SidebarSpacer>
        </div>
    );
}
