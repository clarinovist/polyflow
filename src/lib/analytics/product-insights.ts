/**
 * Pure product-insight computations over UsageEvent aggregates.
 *
 * Numbers here are page views, not usage depth, and only a couple of tenants
 * exist, so raw counts are always returned next to any ratio.
 */

import {
    MODULE_DEFINITIONS,
    type ModuleKey,
} from '@/lib/modules/module-registry';

/** An entitled module with fewer current views than this counts as dead. */
export const DEAD_MODULE_MAX_VIEWS = 10;
/** (cur+1)/(prev+1) at or above this is growth. */
export const GROWING_RATIO = 1.25;
/** (cur+1)/(prev+1) at or below this is decline. */
export const DECLINING_RATIO = 0.75;
/** A feature needs at least this many views in one period to be ranked. */
export const FEATURE_MOVER_MIN_VOLUME = 50;
export const FEATURE_MOVER_LIMIT = 5;

/**
 * Tracker workspace key (feature-registry moduleKey) -> entitlement module.
 * Derived from module-registry workspaceRoots / actionPrefixes:
 * - field is a root of SALES; kiosk is a root of PRODUCTION.
 * - dashboard, support are CORE roots; settings is CORE via its action prefix.
 * - mobile is only the portal picker and no module owns it, so it stays
 *   unmapped and is surfaced rather than guessed.
 */
const WORKSPACE_TO_MODULE: Readonly<Record<string, ModuleKey>> = {
    dashboard: 'CORE',
    settings: 'CORE',
    support: 'CORE',
    hrd: 'HRD',
    sales: 'SALES',
    field: 'SALES',
    purchasing: 'PURCHASING',
    production: 'PRODUCTION',
    kiosk: 'PRODUCTION',
    warehouse: 'INVENTORY',
    finance: 'FINANCE',
    maklon: 'MAKLON',
    distribution: 'DISTRIBUTOR',
};

export function mapWorkspaceToModule(workspaceKey: string): ModuleKey | null {
    return WORKSPACE_TO_MODULE[workspaceKey] ?? null;
}

export type ModuleAdoptionStatus =
    | 'DEAD'
    | 'DECLINING'
    | 'GROWING'
    | 'STABLE'
    | 'NO_ENTITLEMENT';

export interface TenantEntitlementInput {
    tenantId: string;
    moduleKeys: readonly string[];
}

export interface WorkspaceUsageInput {
    tenantId: string;
    workspaceKey: string;
    views: number;
}

export interface ModuleAdoptionRow {
    moduleKey: ModuleKey;
    label: string;
    entitledTenants: number;
    activeTenants: number;
    currentViews: number;
    previousViews: number;
    changePercent: number;
    status: ModuleAdoptionStatus;
}

export interface UnmappedWorkspaceRow {
    workspaceKey: string;
    currentViews: number;
    previousViews: number;
}

export interface ModuleAdoptionResult {
    modules: ModuleAdoptionRow[];
    unmappedWorkspaces: UnmappedWorkspaceRow[];
}

export function percentChange(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

function smoothedRatio(current: number, previous: number): number {
    return (current + 1) / (previous + 1);
}

function classifyTrend(
    current: number,
    previous: number,
): 'GROWING' | 'DECLINING' | 'STABLE' {
    const ratio = smoothedRatio(current, previous);
    if (ratio >= GROWING_RATIO) return 'GROWING';
    if (ratio <= DECLINING_RATIO) return 'DECLINING';
    return 'STABLE';
}

function classifyModule(
    entitledTenants: number,
    current: number,
    previous: number,
): ModuleAdoptionStatus {
    if (entitledTenants === 0) return 'NO_ENTITLEMENT';
    if (current < DEAD_MODULE_MAX_VIEWS) return 'DEAD';
    return classifyTrend(current, previous);
}

interface ModuleTotals {
    views: number;
    tenants: Set<string>;
}

interface UsageRollup {
    byModule: Map<ModuleKey, ModuleTotals>;
    unmapped: Map<string, number>;
}

function rollUp(usage: readonly WorkspaceUsageInput[]): UsageRollup {
    const byModule = new Map<ModuleKey, ModuleTotals>();
    const unmapped = new Map<string, number>();

    for (const row of usage) {
        const moduleKey = mapWorkspaceToModule(row.workspaceKey);
        if (!moduleKey) {
            unmapped.set(
                row.workspaceKey,
                (unmapped.get(row.workspaceKey) ?? 0) + row.views,
            );
            continue;
        }
        const existing = byModule.get(moduleKey);
        const tenants = new Set(existing?.tenants);
        if (row.views > 0) tenants.add(row.tenantId);
        byModule.set(moduleKey, {
            views: (existing?.views ?? 0) + row.views,
            tenants,
        });
    }

    return { byModule, unmapped };
}

function countEntitledTenants(
    entitlements: readonly TenantEntitlementInput[],
    moduleKey: ModuleKey,
): number {
    // CORE is always active, whether or not a TenantModule row exists.
    if (moduleKey === 'CORE') return entitlements.length;
    return entitlements.filter((e) => e.moduleKeys.includes(moduleKey)).length;
}

function buildUnmappedRows(
    current: Map<string, number>,
    previous: Map<string, number>,
): UnmappedWorkspaceRow[] {
    const keys = Array.from(new Set([...current.keys(), ...previous.keys()]));
    return keys
        .sort((a, b) => a.localeCompare(b))
        .map((workspaceKey) => ({
            workspaceKey,
            currentViews: current.get(workspaceKey) ?? 0,
            previousViews: previous.get(workspaceKey) ?? 0,
        }));
}

export function computeModuleAdoption(input: {
    entitlements: readonly TenantEntitlementInput[];
    currentUsage: readonly WorkspaceUsageInput[];
    previousUsage: readonly WorkspaceUsageInput[];
}): ModuleAdoptionResult {
    const current = rollUp(input.currentUsage);
    const previous = rollUp(input.previousUsage);

    const modules = MODULE_DEFINITIONS.map((definition): ModuleAdoptionRow => {
        const currentViews = current.byModule.get(definition.key)?.views ?? 0;
        const previousViews = previous.byModule.get(definition.key)?.views ?? 0;
        const entitledTenants = countEntitledTenants(
            input.entitlements,
            definition.key,
        );
        return {
            moduleKey: definition.key,
            label: definition.label,
            entitledTenants,
            activeTenants: current.byModule.get(definition.key)?.tenants.size ?? 0,
            currentViews,
            previousViews,
            changePercent: percentChange(currentViews, previousViews),
            status: classifyModule(entitledTenants, currentViews, previousViews),
        };
    });

    return {
        modules,
        unmappedWorkspaces: buildUnmappedRows(current.unmapped, previous.unmapped),
    };
}

export interface FeatureUsageInput {
    featureKey: string;
    label: string;
    moduleKey: string;
    current: number;
    previous: number;
}

export interface FeatureMover extends FeatureUsageInput {
    changePercent: number;
    ratio: number;
}

export interface FeatureMoversResult {
    rising: FeatureMover[];
    falling: FeatureMover[];
}

function toMover(feature: FeatureUsageInput): FeatureMover {
    return {
        ...feature,
        changePercent: percentChange(feature.current, feature.previous),
        ratio: smoothedRatio(feature.current, feature.previous),
    };
}

export function computeFeatureMovers(
    features: readonly FeatureUsageInput[],
    limit: number = FEATURE_MOVER_LIMIT,
): FeatureMoversResult {
    const movers = features
        .filter(
            (f) => Math.max(f.current, f.previous) >= FEATURE_MOVER_MIN_VOLUME,
        )
        .map(toMover);

    const byKey = (a: FeatureMover, b: FeatureMover) =>
        a.featureKey.localeCompare(b.featureKey);

    const rising = movers
        .filter((m) => m.ratio > 1)
        .sort((a, b) => b.ratio - a.ratio || byKey(a, b))
        .slice(0, limit);
    const falling = movers
        .filter((m) => m.ratio < 1)
        .sort((a, b) => a.ratio - b.ratio || byKey(a, b))
        .slice(0, limit);

    return { rising, falling };
}
