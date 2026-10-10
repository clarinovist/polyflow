'use server';

import { getMyPermissions } from '@/actions/admin/permissions';
import {
    canAccessWorkspace,
    hasWorkspaceEntitlement,
    hasWorkspaceResourceAccess,
} from '@/lib/auth/access-policy';
import { getUserRoles } from '@/lib/auth/roles';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { AuthorizationError, safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import {
    readDistributionDashboard,
    type DistributionDashboardAggregate,
    type DistributionDashboardProjection,
} from '@/services/distribution/distribution-dashboard-service';

export type DistributionDashboardQuickActionHref =
    | '/sales/orders'
    | '/purchasing/orders'
    | '/sales/deliveries'
    | '/warehouse/inventory'
    | '/sales/invoices';

export type DistributionDashboardData = DistributionDashboardAggregate & {
    quickActionHrefs: DistributionDashboardQuickActionHref[];
};

type Resources = string[] | 'ALL';

function hasExactDestinationCoverage(
    resources: Resources,
    pathname: DistributionDashboardQuickActionHref | '/purchasing/invoices',
): boolean {
    return (
        resources === 'ALL' ||
        resources.some(
            (resource) =>
                resource === pathname || pathname.startsWith(`${resource}/`),
        )
    );
}

async function requireDistributionRootRead(): Promise<Resources> {
    const session = await requireAuth();
    const permissionResult = await getMyPermissions();
    const sessionResources =
        (session.user as { allowedResources?: string[] }).allowedResources ??
        [];
    const resources: Resources =
        permissionResult.success && permissionResult.data
            ? permissionResult.data
            : sessionResources;
    const userForPolicy = {
        ...session.user,
        roles: getUserRoles(session.user),
        allowedResources: resources === 'ALL' ? sessionResources : resources,
    };
    const canOpenRoot =
        hasWorkspaceEntitlement('distribution') &&
        canAccessWorkspace(userForPolicy, 'distribution', '/distribution') &&
        hasWorkspaceResourceAccess(resources, 'distribution') &&
        (resources === 'ALL' || resources.includes('/distribution'));

    if (!canOpenRoot) {
        throw new AuthorizationError(
            'Unauthorized: Akses root Distribution tidak tersedia.',
        );
    }

    return resources;
}

function buildAccessProjection(resources: Resources): {
    dashboard: DistributionDashboardProjection;
    quickActionHrefs: DistributionDashboardQuickActionHref[];
} {
    const salesEntitled = hasWorkspaceEntitlement('sales');
    const purchasingEntitled = hasWorkspaceEntitlement('purchasing');
    const inventoryEntitled = hasWorkspaceEntitlement('warehouse');
    const destinations = {
        salesOrders:
            salesEntitled &&
            hasExactDestinationCoverage(resources, '/sales/orders'),
        purchasingOrders:
            purchasingEntitled &&
            hasExactDestinationCoverage(resources, '/purchasing/orders'),
        salesDeliveries:
            salesEntitled &&
            hasExactDestinationCoverage(resources, '/sales/deliveries'),
        inventory:
            inventoryEntitled &&
            hasExactDestinationCoverage(resources, '/warehouse/inventory'),
        salesInvoices:
            salesEntitled &&
            hasExactDestinationCoverage(resources, '/sales/invoices'),
        purchasingInvoices:
            purchasingEntitled &&
            hasExactDestinationCoverage(resources, '/purchasing/invoices'),
    };
    const quickActionHrefs: DistributionDashboardQuickActionHref[] = [];
    if (destinations.salesOrders) quickActionHrefs.push('/sales/orders');
    if (destinations.purchasingOrders)
        quickActionHrefs.push('/purchasing/orders');
    if (destinations.salesDeliveries)
        quickActionHrefs.push('/sales/deliveries');
    if (destinations.inventory) quickActionHrefs.push('/warehouse/inventory');
    if (destinations.salesInvoices) quickActionHrefs.push('/sales/invoices');

    return {
        dashboard: {
            salesOrders: destinations.salesOrders ? '/sales/orders' : null,
            readyWithoutDo:
                destinations.salesOrders && destinations.salesDeliveries
                    ? '/sales/deliveries'
                    : null,
            purchasingOrders: destinations.purchasingOrders
                ? '/purchasing/orders'
                : null,
            inventory: destinations.inventory ? '/warehouse/inventory' : null,
            accountsReceivable: destinations.salesInvoices
                ? '/sales/invoices'
                : null,
            accountsPayable: destinations.purchasingInvoices
                ? '/purchasing/invoices'
                : null,
        },
        quickActionHrefs,
    };
}

export const getDistributionDashboard = withTenant(
    async function getDistributionDashboard() {
        return safeAction(async (): Promise<DistributionDashboardData> => {
            const resources = await requireDistributionRootRead();
            const snapshotAt = new Date();
            const access = buildAccessProjection(resources);
            const dashboard = await readDistributionDashboard(
                prisma,
                access.dashboard,
                { snapshotAt },
            );
            return {
                ...dashboard,
                quickActionHrefs: access.quickActionHrefs,
            };
        });
    },
);
