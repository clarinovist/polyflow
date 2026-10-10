'use server';

import { getMyPermissions } from '@/actions/admin/permissions';
import {
    canAccessWorkspace,
    hasWorkspaceResourceAccess,
} from '@/lib/auth/access-policy';
import { getUserRoles } from '@/lib/auth/roles';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { AuthorizationError, safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import {
    readHrdDashboardAggregate,
    type HrdDashboardAggregate,
} from '@/services/hrd/hrd-dashboard-service';

export type HrdShiftBoard = HrdDashboardAggregate;

async function requireHrdRootRead() {
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
        canAccessWorkspace(userForPolicy, 'hrd', '/hrd') &&
        hasWorkspaceResourceAccess(resources, 'hrd') &&
        (resources === 'ALL' || resources.includes('/hrd'));

    if (!canOpenRoot) {
        throw new AuthorizationError(
            'Unauthorized: Akses root HRD tidak tersedia.',
        );
    }

    return session;
}

export const getHrdShiftBoard = withTenant(async function getHrdShiftBoard() {
    return safeAction(async () => {
        await requireHrdRootRead();
        return readHrdDashboardAggregate(prisma);
    });
});
