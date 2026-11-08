import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    groupBy: vi.fn(),
    tenantFindMany: vi.fn(),
    tenantModuleFindMany: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        usageEvent: { groupBy: mocks.groupBy },
        tenant: { findMany: mocks.tenantFindMany },
    },
    getMainPrisma: () => ({
        tenantModule: { findMany: mocks.tenantModuleFindMany },
    }),
}));

import { UsageInsightsService } from '../usage-insights.service';

describe('UsageInsightsService.getProductInsights', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tenantFindMany.mockResolvedValue([
            { id: 'tenant-a' },
            { id: 'tenant-b' },
        ]);
        mocks.tenantModuleFindMany.mockResolvedValue([
            { tenantId: 'tenant-a', moduleKey: 'SALES', expiresAt: null },
            {
                tenantId: 'tenant-b',
                moduleKey: 'FINANCE',
                expiresAt: new Date('2000-01-01T00:00:00Z'),
            },
        ]);
    });

    it('combines per-tenant module counts, feature counts and entitlements', async () => {
        // call order: tenant+module curr, prev, feature curr, prev
        mocks.groupBy
            .mockResolvedValueOnce([
                { tenantId: 'tenant-a', moduleKey: 'sales', _count: { _all: 120 } },
                { tenantId: 'tenant-a', moduleKey: 'mobile', _count: { _all: 5 } },
            ])
            .mockResolvedValueOnce([
                { tenantId: 'tenant-a', moduleKey: 'sales', _count: { _all: 40 } },
            ])
            .mockResolvedValueOnce([
                { featureKey: 'sales.orders.list', moduleKey: 'sales', _count: { _all: 120 } },
            ])
            .mockResolvedValueOnce([
                { featureKey: 'sales.orders.list', moduleKey: 'sales', _count: { _all: 40 } },
            ]);

        const result = await UsageInsightsService.getProductInsights({ range: '7d' });

        const sales = result.modules.find((m) => m.moduleKey === 'SALES');
        expect(sales).toMatchObject({
            entitledTenants: 1,
            currentViews: 120,
            previousViews: 40,
            status: 'GROWING',
        });
        // expired entitlement must not count
        expect(result.modules.find((m) => m.moduleKey === 'FINANCE')?.entitledTenants).toBe(0);
        expect(result.unmappedWorkspaces).toEqual([
            { workspaceKey: 'mobile', currentViews: 5, previousViews: 0 },
        ]);
        expect(result.risingFeatures[0]).toMatchObject({
            featureKey: 'sales.orders.list',
            label: 'Daftar Sales Order',
            current: 120,
            previous: 40,
        });
        expect(result.totalTenants).toBe(2);
    });

    it('excludes platform tenants and admin events from every usage query', async () => {
        mocks.groupBy.mockResolvedValue([]);

        await UsageInsightsService.getProductInsights({ range: '7d' });

        expect(mocks.groupBy).toHaveBeenCalledTimes(4);
        for (const [args] of mocks.groupBy.mock.calls) {
            expect(args.where).toMatchObject({
                eventType: 'FEATURE_VIEW',
                tenantId: { notIn: ['main', 'admin'] },
                moduleKey: { not: 'admin' },
            });
        }
    });
});
