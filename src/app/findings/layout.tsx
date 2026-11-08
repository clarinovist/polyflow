import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getMyPermissions } from '@/actions/admin/permissions';
import { PathBreadCrumb } from '@/components/layout/path-breadcrumb';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { SidebarSpacer } from '@/components/layout/sidebar-spacer';
import { SkipToMainContent } from '@/components/layout/skip-to-main-content';
import {
    buildWorkspaceEntryHrefs,
    getTenantActiveModules,
} from '@/lib/auth/access-policy';
import { getCentralWorkspaceOptions } from '@/lib/auth/central-workspaces';
import { getMainPrisma } from '@/lib/core/prisma';

/**
 * Shell for the findings inbox, same navigation as the dashboard. It does NOT
 * copy the dashboard's "path must be a granted resource" redirect: /findings is
 * not a permission resource, visibility is decided per finding by the page.
 * Unauthenticated visitors are bounced here and again by the page itself.
 */
export default async function FindingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    if (!session?.user) redirect('/login');

    const permissionsRes = await getMyPermissions();
    const sessionAllowed =
        (session.user as { allowedResources?: string[] }).allowedResources ??
        [];
    const permissions: string[] | 'ALL' =
        permissionsRes.success && permissionsRes.data
            ? permissionsRes.data
            : sessionAllowed;

    const tenantId = session.user.tenantId;
    const currentTenant = tenantId
        ? await getMainPrisma().tenant.findUnique({
              where: { id: tenantId },
              select: { id: true, name: true },
          })
        : null;
    let workspaces: Awaited<ReturnType<typeof getCentralWorkspaceOptions>> = [];
    try {
        workspaces = await getCentralWorkspaceOptions(
            session.user.globalAccountId,
        );
    } catch {
        // Workspace switching is optional navigation; the inbox stays usable.
        workspaces = [];
    }

    return (
        <div className="min-h-screen bg-secondary/30">
            <SkipToMainContent />
            <SidebarNav
                user={{
                    name: session.user.name,
                    email: session.user.email,
                    role: (session.user as { role?: string }).role,
                }}
                permissions={permissions}
                activeModules={getTenantActiveModules()}
                entryHrefs={buildWorkspaceEntryHrefs(permissions)}
                currentTenantId={currentTenant?.id}
                currentTenantName={currentTenant?.name}
                workspaces={workspaces}
                centralLoginHint={!session.user.globalAccountId}
            />
            <SidebarSpacer>
                <main id="main-content" tabIndex={-1} className="min-h-screen">
                    <div className="p-4 md:p-6 lg:p-8">
                        <PathBreadCrumb />
                        {children}
                    </div>
                </main>
            </SidebarSpacer>
        </div>
    );
}
