'use server';

import { getMyPermissions } from '@/actions/admin/permissions';
import {
    canAccessWorkspace,
    hasWorkspaceEntitlement,
    hasWorkspaceResourceAccess,
    isPathAllowedByResources,
} from '@/lib/auth/access-policy';
import { getUserRoles } from '@/lib/auth/roles';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { AuthorizationError, safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import {
    readMaklonDashboard,
    type MaklonDashboardAggregate,
} from '@/services/maklon/maklon-dashboard-service';

export type MaklonDashboardQuickActionHref =
    | '/maklon/receipts'
    | '/maklon/returns'
    | '/maklon/returns/create'
    | '/warehouse/incoming/create-maklon'
    | '/warehouse';

export type MaklonDashboardData = MaklonDashboardAggregate & {
    quickActionHrefs: MaklonDashboardQuickActionHref[];
};

async function requireMaklonRootRead(): Promise<string[] | 'ALL'> {
    const session = await requireAuth();
    const permissionResult = await getMyPermissions();
    const sessionResources =
        (session.user as { allowedResources?: string[] }).allowedResources ??
        [];
    const resources =
        permissionResult.success && permissionResult.data
            ? permissionResult.data
            : sessionResources;
    const userForPolicy = {
        ...session.user,
        roles: getUserRoles(session.user),
        allowedResources: resources === 'ALL' ? sessionResources : resources,
    };
    const canOpenRoot =
        hasWorkspaceEntitlement('maklon') &&
        canAccessWorkspace(userForPolicy, 'maklon', '/maklon') &&
        hasWorkspaceResourceAccess(resources, 'maklon') &&
        (resources === 'ALL' || resources.includes('/maklon'));

    if (!canOpenRoot) {
        throw new AuthorizationError(
            'Unauthorized: Akses root Maklon tidak tersedia.',
        );
    }

    return resources;
}

function quickActionHrefs(
    resources: string[] | 'ALL',
): MaklonDashboardQuickActionHref[] {
    const hrefs: MaklonDashboardQuickActionHref[] = [
        '/maklon/receipts',
        '/maklon/returns',
        '/maklon/returns/create',
    ];

    // Maklon-local destinations are covered by the exact root grant above.
    // Cross-workspace destinations require direct path coverage; the generic
    // workspace-root reachability rule is intentionally not used here.
    const hasExactDestinationCoverage = (pathname: string) =>
        resources === 'ALL' ||
        resources.some(
            (resource) =>
                resource === pathname || pathname.startsWith(`${resource}/`),
        );

    if (
        hasWorkspaceEntitlement('warehouse') &&
        isPathAllowedByResources(
            '/warehouse/incoming/create-maklon',
            resources,
        ) &&
        hasExactDestinationCoverage('/warehouse/incoming')
    ) {
        hrefs.push('/warehouse/incoming/create-maklon');
    }
    if (
        hasWorkspaceEntitlement('warehouse') &&
        isPathAllowedByResources('/warehouse', resources) &&
        hasExactDestinationCoverage('/warehouse')
    ) {
        hrefs.push('/warehouse');
    }

    return hrefs;
}

export const getMaklonDashboard = withTenant(
    async function getMaklonDashboard() {
        return safeAction(async (): Promise<MaklonDashboardData> => {
            const resources = await requireMaklonRootRead();
            const dashboard = await readMaklonDashboard(prisma);
            return {
                ...dashboard,
                quickActionHrefs: quickActionHrefs(resources),
            };
        });
    },
);
