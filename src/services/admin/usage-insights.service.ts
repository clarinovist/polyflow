import { prisma, getMainPrisma } from '@/lib/core/prisma';
import { getAllRegisteredFeatures } from '@/lib/analytics/feature-registry';
import {
    computeFeatureMovers,
    computeModuleAdoption,
    type FeatureMover,
    type ModuleAdoptionRow,
    type TenantEntitlementInput,
    type UnmappedWorkspaceRow,
    type WorkspaceUsageInput,
} from '@/lib/analytics/product-insights';
import {
    calculateJakartaBounds,
    type UsageAnalyticsFilter,
} from './usage-analytics.service';

export type ProductInsightsFilter = Pick<
    UsageAnalyticsFilter,
    'range' | 'startDate' | 'endDate'
>;

export interface ProductInsightsData {
    periodLabel: string;
    totalTenants: number;
    modules: ModuleAdoptionRow[];
    unmappedWorkspaces: UnmappedWorkspaceRow[];
    risingFeatures: FeatureMover[];
    fallingFeatures: FeatureMover[];
}

interface DateRange {
    gte: Date;
    lte: Date;
}

function buildWhere(range: DateRange) {
    // Same exclusions as the overview tenant metrics: platform events are not
    // tenant adoption.
    return {
        eventType: 'FEATURE_VIEW',
        occurredAt: range,
        tenantId: { notIn: ['main', 'admin'] },
        moduleKey: { not: 'admin' },
    };
}

async function loadWorkspaceUsage(
    range: DateRange,
): Promise<WorkspaceUsageInput[]> {
    const rows = await prisma.usageEvent.groupBy({
        by: ['tenantId', 'moduleKey'],
        _count: { _all: true },
        where: buildWhere(range),
    });
    return rows.map((r) => ({
        tenantId: r.tenantId,
        workspaceKey: r.moduleKey,
        views: r._count._all,
    }));
}

async function loadFeatureUsage(
    range: DateRange,
): Promise<Map<string, { moduleKey: string; views: number }>> {
    const rows = await prisma.usageEvent.groupBy({
        by: ['featureKey', 'moduleKey'],
        _count: { _all: true },
        where: buildWhere(range),
    });
    return new Map(
        rows.map((r) => [
            r.featureKey,
            { moduleKey: r.moduleKey, views: r._count._all },
        ]),
    );
}

/**
 * TenantModule lives in the MAIN db, so it must go through getMainPrisma()
 * (see the schema comment on TenantModule).
 */
async function loadEntitlements(): Promise<{
    entitlements: TenantEntitlementInput[];
    totalTenants: number;
}> {
    const [tenants, rows] = await Promise.all([
        prisma.tenant.findMany({ select: { id: true } }),
        getMainPrisma().tenantModule.findMany({
            where: { status: 'ACTIVE' },
            select: { tenantId: true, moduleKey: true, expiresAt: true },
        }),
    ]);

    const now = new Date();
    const activeRows = rows.filter((r) => !r.expiresAt || r.expiresAt >= now);
    const entitlements = tenants.map(
        (t): TenantEntitlementInput => ({
            tenantId: t.id,
            moduleKeys: activeRows
                .filter((r) => r.tenantId === t.id)
                .map((r) => r.moduleKey),
        }),
    );
    return { entitlements, totalTenants: tenants.length };
}

function mergeFeatureUsage(
    current: Map<string, { moduleKey: string; views: number }>,
    previous: Map<string, { moduleKey: string; views: number }>,
) {
    const labels = new Map(
        getAllRegisteredFeatures().map((f) => [f.featureKey, f.label]),
    );
    const keys = new Set([...current.keys(), ...previous.keys()]);
    return Array.from(keys).map((featureKey) => ({
        featureKey,
        label: labels.get(featureKey) ?? featureKey,
        moduleKey:
            current.get(featureKey)?.moduleKey ??
            previous.get(featureKey)?.moduleKey ??
            'unknown',
        current: current.get(featureKey)?.views ?? 0,
        previous: previous.get(featureKey)?.views ?? 0,
    }));
}

export class UsageInsightsService {
    static async getProductInsights(
        filter: ProductInsightsFilter = {},
    ): Promise<ProductInsightsData> {
        const { start, end, prevStart, prevEnd, label } =
            calculateJakartaBounds(filter);
        const currRange = { gte: start, lte: end };
        const prevRange = { gte: prevStart, lte: prevEnd };

        const [
            currWorkspace,
            prevWorkspace,
            currFeatures,
            prevFeatures,
            entitlementData,
        ] = await Promise.all([
            loadWorkspaceUsage(currRange),
            loadWorkspaceUsage(prevRange),
            loadFeatureUsage(currRange),
            loadFeatureUsage(prevRange),
            loadEntitlements(),
        ]);

        const adoption = computeModuleAdoption({
            entitlements: entitlementData.entitlements,
            currentUsage: currWorkspace,
            previousUsage: prevWorkspace,
        });
        const movers = computeFeatureMovers(
            mergeFeatureUsage(currFeatures, prevFeatures),
        );

        return {
            periodLabel: label,
            totalTenants: entitlementData.totalTenants,
            modules: adoption.modules,
            unmappedWorkspaces: adoption.unmappedWorkspaces,
            risingFeatures: movers.rising,
            fallingFeatures: movers.falling,
        };
    }
}
