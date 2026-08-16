import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { DistributionSidebar } from '@/components/distribution/distribution-sidebar';
import {
    canAccessWorkspace,
    getPreferredWorkspaceLanding,
    hasWorkspaceEntitlement,
    hasWorkspaceResourceAccess,
    isPathAllowedByResources,
} from '@/lib/auth/access-policy';
import { PathBreadCrumb } from '@/components/layout/path-breadcrumb';
import { SidebarSpacer } from '@/components/layout/sidebar-spacer';
import { getMyPermissions } from '@/actions/admin/permissions';
import { headers } from 'next/headers';

export default async function DistributionLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    // ── Entitlement gate: tenant must own the DISTRIBUTOR module ──
    if (!hasWorkspaceEntitlement('distribution')) {
        redirect('/error?error=ModuleNotEntitled');
    }

    const reqHeaders = await headers();
    const pathname = reqHeaders.get('x-pathname') || '/distribution';

    const permissionsRes = await getMyPermissions();
    const sessionAllowed =
        (session.user as { allowedResources?: string[] })?.allowedResources ||
        [];
    const permissions: string[] | 'ALL' =
        permissionsRes.success && permissionsRes.data
            ? permissionsRes.data
            : sessionAllowed.length > 0
              ? sessionAllowed
              : [];

    const userForPolicy = {
        ...session.user,
        allowedResources:
            permissions === 'ALL' ? sessionAllowed : (permissions as string[]),
    };

    if (!canAccessWorkspace(userForPolicy, 'distribution', pathname)) {
        redirect('/dashboard?error=Unauthorized');
    }

    if (!hasWorkspaceResourceAccess(permissions, 'distribution')) {
        redirect('/dashboard?error=Unauthorized');
    }

    if (
        pathname === '/distribution' &&
        permissions !== 'ALL' &&
        !permissions.includes('/distribution')
    ) {
        redirect(getPreferredWorkspaceLanding('distribution', permissions));
    }

    // Defense in depth: deny deep paths not covered by any granted resource
    if (
        permissions !== 'ALL' &&
        pathname !== '/distribution' &&
        !isPathAllowedByResources(pathname, permissions)
    ) {
        redirect(getPreferredWorkspaceLanding('distribution', permissions));
    }

    return (
        <div className="min-h-screen bg-background">
            <DistributionSidebar user={session.user} permissions={permissions} />
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
