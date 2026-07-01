import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { WarehouseSidebar } from '@/components/warehouse/warehouse-sidebar';
import { ClockDisplay } from '../kiosk/ClockDisplay';
import { canAccessWorkspace } from '@/lib/auth/access-policy';
import { PathBreadCrumb } from '@/components/layout/path-breadcrumb';
import { SidebarSpacer } from '@/components/layout/sidebar-spacer';
import { getMyPermissions } from '@/actions/admin/permissions';

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

    if (!canAccessWorkspace(session.user, 'warehouse')) {
        redirect('/dashboard');
    }

    const permissionsRes = await getMyPermissions();
    const permissions = permissionsRes.success && permissionsRes.data ? permissionsRes.data : [];
    if (permissions !== 'ALL' && !permissions.includes('/warehouse')) {
        redirect('/logout');
    }

    return (
        <div className="min-h-screen bg-background flex text-foreground">
            {/* Dedicated Warehouse Sidebar */}
            <WarehouseSidebar user={user} />

            <SidebarSpacer className="flex-1 flex flex-col min-h-screen">
                {/* Simplified Header for Utility (Clock, Context) */}
                <header className="sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur-md px-6 h-16 flex items-center justify-between shadow-sm">
                    <div>
                        <h1 className="text-md font-bold">Warehouse Workspace</h1>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">PolyFlow ERP</p>
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
