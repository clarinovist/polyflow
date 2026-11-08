import { describe, it, expect } from 'vitest';
import {
    DEAD_MODULE_MAX_VIEWS,
    FEATURE_MOVER_MIN_VOLUME,
    computeFeatureMovers,
    computeModuleAdoption,
    mapWorkspaceToModule,
} from '../product-insights';

const entitlements = [
    { tenantId: 'tenant-a', moduleKeys: ['SALES', 'FINANCE'] },
    { tenantId: 'tenant-b', moduleKeys: ['SALES'] },
];

function rowFor(
    result: ReturnType<typeof computeModuleAdoption>,
    key: string,
) {
    const row = result.modules.find((m) => m.moduleKey === key);
    if (!row) throw new Error(`row ${key} missing`);
    return row;
}

describe('mapWorkspaceToModule', () => {
    it('maps tracker workspaces to entitlement modules', () => {
        expect(mapWorkspaceToModule('warehouse')).toBe('INVENTORY');
        expect(mapWorkspaceToModule('kiosk')).toBe('PRODUCTION');
        expect(mapWorkspaceToModule('field')).toBe('SALES');
        expect(mapWorkspaceToModule('distribution')).toBe('DISTRIBUTOR');
        expect(mapWorkspaceToModule('dashboard')).toBe('CORE');
        expect(mapWorkspaceToModule('settings')).toBe('CORE');
        expect(mapWorkspaceToModule('support')).toBe('CORE');
    });

    it('returns null for unknown workspaces and the mobile hub', () => {
        expect(mapWorkspaceToModule('mobile')).toBeNull();
        expect(mapWorkspaceToModule('mystery')).toBeNull();
    });
});

describe('computeModuleAdoption', () => {
    it('marks an entitled module with almost no views as DEAD', () => {
        const result = computeModuleAdoption({
            entitlements,
            currentUsage: [
                { tenantId: 'tenant-a', workspaceKey: 'finance', views: DEAD_MODULE_MAX_VIEWS - 1 },
            ],
            previousUsage: [
                { tenantId: 'tenant-a', workspaceKey: 'finance', views: 500 },
            ],
        });

        const finance = rowFor(result, 'FINANCE');
        expect(finance.status).toBe('DEAD');
        expect(finance.entitledTenants).toBe(1);
        expect(finance.activeTenants).toBe(1);
        expect(finance.currentViews).toBe(DEAD_MODULE_MAX_VIEWS - 1);
        expect(finance.previousViews).toBe(500);
    });

    it('marks a module with clearly fewer views than before as DECLINING', () => {
        const result = computeModuleAdoption({
            entitlements,
            currentUsage: [{ tenantId: 'tenant-a', workspaceKey: 'sales', views: 100 }],
            previousUsage: [{ tenantId: 'tenant-a', workspaceKey: 'sales', views: 300 }],
        });

        const sales = rowFor(result, 'SALES');
        expect(sales.status).toBe('DECLINING');
        expect(sales.changePercent).toBe(-67);
        expect(sales.activeTenants).toBe(1);
        expect(sales.entitledTenants).toBe(2);
    });

    it('marks a module with clearly more views than before as GROWING', () => {
        const result = computeModuleAdoption({
            entitlements,
            currentUsage: [
                { tenantId: 'tenant-a', workspaceKey: 'sales', views: 200 },
                { tenantId: 'tenant-b', workspaceKey: 'sales', views: 100 },
            ],
            previousUsage: [{ tenantId: 'tenant-a', workspaceKey: 'sales', views: 100 }],
        });

        const sales = rowFor(result, 'SALES');
        expect(sales.status).toBe('GROWING');
        expect(sales.activeTenants).toBe(2);
        expect(sales.currentViews).toBe(300);
    });

    it('marks a module with similar views as STABLE', () => {
        const result = computeModuleAdoption({
            entitlements,
            currentUsage: [{ tenantId: 'tenant-a', workspaceKey: 'sales', views: 105 }],
            previousUsage: [{ tenantId: 'tenant-a', workspaceKey: 'sales', views: 100 }],
        });

        expect(rowFor(result, 'SALES').status).toBe('STABLE');
    });

    it('merges several tracker workspaces into one entitlement module', () => {
        const result = computeModuleAdoption({
            entitlements,
            currentUsage: [
                { tenantId: 'tenant-a', workspaceKey: 'sales', views: 40 },
                { tenantId: 'tenant-a', workspaceKey: 'field', views: 60 },
            ],
            previousUsage: [],
        });

        expect(rowFor(result, 'SALES').currentViews).toBe(100);
    });

    it('treats CORE as entitled for every tenant', () => {
        const result = computeModuleAdoption({
            entitlements,
            currentUsage: [{ tenantId: 'tenant-a', workspaceKey: 'dashboard', views: 80 }],
            previousUsage: [],
        });

        expect(rowFor(result, 'CORE').entitledTenants).toBe(2);
    });

    it('flags modules nobody is entitled to instead of calling them dead', () => {
        const result = computeModuleAdoption({
            entitlements,
            currentUsage: [],
            previousUsage: [],
        });

        const hrd = rowFor(result, 'HRD');
        expect(hrd.entitledTenants).toBe(0);
        expect(hrd.status).toBe('NO_ENTITLEMENT');
    });

    it('surfaces unmapped workspaces instead of dropping them', () => {
        const result = computeModuleAdoption({
            entitlements,
            currentUsage: [
                { tenantId: 'tenant-a', workspaceKey: 'mobile', views: 7 },
                { tenantId: 'tenant-b', workspaceKey: 'mobile', views: 3 },
            ],
            previousUsage: [{ tenantId: 'tenant-a', workspaceKey: 'mobile', views: 4 }],
        });

        expect(result.unmappedWorkspaces).toEqual([
            { workspaceKey: 'mobile', currentViews: 10, previousViews: 4 },
        ]);
    });

    it('does not mutate its inputs', () => {
        const input = {
            entitlements: [{ tenantId: 'tenant-a', moduleKeys: ['SALES'] }],
            currentUsage: [{ tenantId: 'tenant-a', workspaceKey: 'sales', views: 20 }],
            previousUsage: [],
        };
        const snapshot = JSON.parse(JSON.stringify(input));

        computeModuleAdoption(input);

        expect(input).toEqual(snapshot);
    });
});

describe('computeFeatureMovers', () => {
    const feature = (featureKey: string, current: number, previous: number) => ({
        featureKey,
        label: featureKey,
        moduleKey: 'sales',
        current,
        previous,
    });

    it('ranks rising features by (cur+1)/(prev+1) and falling features ascending', () => {
        const result = computeFeatureMovers([
            feature('a.up-big', 400, 100),
            feature('b.up-small', 150, 100),
            feature('c.down-big', 60, 300),
            feature('d.down-small', 90, 100),
        ]);

        expect(result.rising.map((f) => f.featureKey)).toEqual(['a.up-big', 'b.up-small']);
        expect(result.falling.map((f) => f.featureKey)).toEqual(['c.down-big', 'd.down-small']);
    });

    it('ignores features whose volume in both periods is below the minimum', () => {
        const below = FEATURE_MOVER_MIN_VOLUME - 1;
        const result = computeFeatureMovers([
            feature('tiny.up', below, 0),
            feature('tiny.down', 0, below),
            feature('big.up', FEATURE_MOVER_MIN_VOLUME, 0),
        ]);

        expect(result.rising.map((f) => f.featureKey)).toEqual(['big.up']);
        expect(result.falling).toEqual([]);
    });

    it('keeps a feature that collapsed from high volume to zero', () => {
        const result = computeFeatureMovers([feature('gone', 0, 200)]);

        expect(result.falling.map((f) => f.featureKey)).toEqual(['gone']);
    });

    it('limits each list and leaves unchanged features out', () => {
        const many = Array.from({ length: 10 }, (_, i) => feature(`f.${i}`, 100 + i * 20, 100));
        const result = computeFeatureMovers([...many, feature('flat', 100, 100)], 3);

        expect(result.rising).toHaveLength(3);
        expect(result.rising.map((f) => f.featureKey)).not.toContain('flat');
        expect(result.falling).toEqual([]);
    });

    it('does not mutate its input', () => {
        const input = [feature('x', 300, 100), feature('y', 100, 300)];
        const snapshot = JSON.parse(JSON.stringify(input));

        computeFeatureMovers(input);

        expect(input).toEqual(snapshot);
    });
});
