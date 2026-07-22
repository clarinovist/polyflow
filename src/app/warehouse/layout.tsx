import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { WarehouseSidebar } from '@/components/warehouse/warehouse-sidebar';
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

export default async function WarehouseLayout({
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

    const reqHeaders = await headers();
    const pathname = reqHeaders.get('x-pathname') || '/warehouse';

    // Prefer fresh DB permissions for layout gates; fall back to JWT snapshot.
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
        // Overlay fresh permissions so Access Control changes work without
        // waiting for a full re-login when layout is the gate.
        allowedResources:
            permissions === 'ALL' ? sessionAllowed : (permissions as string[]),
    };

    if (!canAccessWorkspace(userForPolicy, 'warehouse', pathname)) {
        redirect('/dashboard');
    }

    if (!hasWorkspaceResourceAccess(permissions, 'warehouse')) {
        redirect('/dashboard?error=Unauthorized');
    }

    // Nested-only grants (e.g. /warehouse/inventory): bounce root → preferred page
    if (
        pathname === '/warehouse' &&
        permissions !== 'ALL' &&
        !permissions.includes('/warehouse')
    ) {
        redirect(getPreferredWorkspaceLanding('warehouse', permissions));
    }

    // Defense in depth: deny deep paths not covered by any granted resource
    if (
        permissions !== 'ALL' &&
        pathname !== '/warehouse' &&
        !isPathAllowedByResources(pathname, permissions)
    ) {
        redirect(getPreferredWorkspaceLanding('warehouse', permissions));
    }

    return (
        <div className="min-h-screen bg-background flex text-foreground">
            {/* Dedicated Warehouse Sidebar */}
            <WarehouseSidebar user={user} permissions={permissions} />

            <SidebarSpacer className="flex-1 flex flex-col min-h-screen">
                {/* Simplified Header for Utility (Clock, Context) */}
                <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur-md px-6 h-16 flex items-center justify-between shadow-sm">
                    <div>
                        <h1 className="text-md font-bold">Portal Gudang</h1>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Operasional Stok & Material</p>
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
