import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageAnalyticsService } from '../usage-analytics.service';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        usageEvent: {
            count: vi.fn(),
            groupBy: vi.fn(),
        },
        tenant: {
            findMany: vi.fn(),
        },
        $queryRaw: vi.fn(),
    },
    getTenantDb: vi.fn(),
}));

import { prisma, getTenantDb } from '@/lib/core/prisma';

describe('UsageAnalyticsService Hardened', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('aggregates usage analytics metrics using PostgreSQL aggregations', async () => {
        const mockTenants = [
            { id: 'tenant-1', name: 'Kiyowo Craft', subdomain: 'kiyowo' },
            { id: 'tenant-2', name: 'Melindo Rafia', subdomain: 'melindo' },
        ];

        vi.mocked(prisma.tenant.findMany).mockResolvedValue(mockTenants as never);
        vi.mocked(prisma.usageEvent.count)
            .mockResolvedValueOnce(150) // current total views
            .mockResolvedValueOnce(100); // previous total views

        vi.mocked(prisma.$queryRaw)
            .mockResolvedValueOnce([{ count: BigInt(25) }]) // current active users
            .mockResolvedValueOnce([{ count: BigInt(20) }]) // prev active users
            .mockResolvedValueOnce([
                {
                    featureKey: 'sales.orders.list',
                    moduleKey: 'sales',
                    currViews: BigInt(50),
                    uniqueUsers: BigInt(10),
                    uniqueTenants: BigInt(2),
                },
            ]) // top features raw
            .mockResolvedValueOnce([
                {
                    tenantId: 'tenant-1',
                    currViews: BigInt(100),
                    activeUsers: BigInt(15),
                    featuresUsed: BigInt(8),
                    lastActivity: new Date('2026-07-27T10:00:00Z'),
                },
            ]) // tenant summaries raw
            .mockResolvedValueOnce([]) // active users today raw
            .mockResolvedValueOnce([
                {
                    tenantId: 'tenant-1',
                    userId: 'user-a',
                    totalViews: BigInt(120),
                    featuresUsed: BigInt(6),
                    activeDays: BigInt(9),
                    lastActiveAt: new Date('2026-07-27T10:00:00Z'),
                },
            ]) // user summaries raw (per selected range)
            .mockResolvedValueOnce([
                {
                    dateStr: '2026-07-27',
                    totalViews: BigInt(50),
                    activeUsers: BigInt(10),
                    activeTenants: BigInt(2),
                },
            ]); // daily trends raw

        vi.mocked(prisma.usageEvent.groupBy)
            .mockResolvedValueOnce([{ tenantId: 'tenant-1' }, { tenantId: 'tenant-2' }] as never) // curr active tenants
            .mockResolvedValueOnce([{ tenantId: 'tenant-1' }] as never) // prev active tenants
            .mockResolvedValueOnce([{ featureKey: 'sales.orders.list' }] as never) // curr features used
            .mockResolvedValueOnce([{ featureKey: 'sales.orders.list' }] as never) // prev features used
            .mockResolvedValueOnce([{ featureKey: 'sales.orders.list', _count: { _all: 30 } }] as never) // prev top feature views
            .mockResolvedValueOnce([{ tenantId: 'tenant-1', _count: { _all: 80 } }] as never); // prev tenant views

        const data = await UsageAnalyticsService.getAnalytics({ range: '7d' });

        expect(data.metrics.totalViews.value).toBe(150);
        expect(data.metrics.totalViews.prevValue).toBe(100);
        expect(data.metrics.totalViews.changePercent).toBe(50);

        expect(data.metrics.activeUsers.value).toBe(25);
        expect(data.metrics.activeTenants.value).toBe(2);

        expect(data.topFeatures.length).toBe(1);
        expect(data.topFeatures[0].featureKey).toBe('sales.orders.list');
        expect(data.topFeatures[0].totalViews).toBe(50);

        expect(data.tenantSummaries.length).toBe(1);
        expect(data.tenantSummaries[0].tenantName).toBe('Kiyowo Craft');
        expect(data.dailyTrends.length).toBeGreaterThan(0);

        // Regression guard: "occurredAt" is a naive TIMESTAMP column that Prisma
        // always fills with UTC wall-clock values. A single `AT TIME ZONE
        // 'Asia/Jakarta'` on it treats the UTC value as if it were already WIB
        // and shifts it the wrong way, so dateStr keys stop matching the
        // (correctly computed) zero-filled dates on the JS side and the chart
        // renders as flat/empty. The fix must convert in two explicit steps:
        // treat as UTC first, then convert to Asia/Jakarta.
        const dailyTrendsQueryCall = vi.mocked(prisma.$queryRaw).mock.calls[6];
        const dailyTrendsSql = (dailyTrendsQueryCall[0] as unknown as string[]).join('?');
        expect(dailyTrendsSql).toMatch(
            /"occurredAt"\s+AT TIME ZONE\s+'UTC'\)\s+AT TIME ZONE\s+'Asia\/Jakarta'/,
        );
    });

    it('supports today, yesterday, 30d, and custom ranges', async () => {
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([]);
        vi.mocked(prisma.usageEvent.count).mockResolvedValue(0);
        vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
        vi.mocked(prisma.usageEvent.groupBy).mockResolvedValue([]);

        const todayData = await UsageAnalyticsService.getAnalytics({ range: 'today' });
        expect(todayData.periodLabel).toBe('Hari Ini');

        const yesterdayData = await UsageAnalyticsService.getAnalytics({ range: 'yesterday' });
        expect(yesterdayData.periodLabel).toBe('Kemarin');

        const thirtyDayData = await UsageAnalyticsService.getAnalytics({ range: '30d' });
        expect(thirtyDayData.periodLabel).toBe('30 Hari Terakhir');

        const customData = await UsageAnalyticsService.getAnalytics({
            range: 'custom',
            startDate: '2026-07-01',
            endDate: '2026-07-15',
        });
        expect(customData.periodLabel).toBe('2026-07-01 s/d 2026-07-15');
    });

    it('throws BusinessRuleError for invalid custom date ranges', async () => {
        await expect(
            UsageAnalyticsService.getAnalytics({ range: 'custom' }),
        ).rejects.toThrow(/wajib diisi/);

        await expect(
            UsageAnalyticsService.getAnalytics({
                range: 'custom',
                startDate: '2026-00-15',
                endDate: '2026-07-15',
            }),
        ).rejects.toThrow(/harus YYYY-MM-DD/);

        await expect(
            UsageAnalyticsService.getAnalytics({
                range: 'custom',
                startDate: '2026-07-35',
                endDate: '2026-07-15',
            }),
        ).rejects.toThrow(/harus YYYY-MM-DD/);

        await expect(
            UsageAnalyticsService.getAnalytics({
                range: 'custom',
                startDate: '2026-07-20',
                endDate: '2026-07-10',
            }),
        ).rejects.toThrow(/lebih besar/);

        await expect(
            UsageAnalyticsService.getAnalytics({
                range: 'custom',
                startDate: '2026-01-01',
                endDate: '2026-06-01',
            }),
        ).rejects.toThrow(/maksimal 90 hari/);
    });

    it('applies tenantId and moduleKey filters correctly', async () => {
        vi.mocked(prisma.tenant.findMany).mockResolvedValue([]);
        vi.mocked(prisma.usageEvent.count).mockResolvedValue(10);
        vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
        vi.mocked(prisma.usageEvent.groupBy).mockResolvedValue([]);

        const data = await UsageAnalyticsService.getAnalytics({
            tenantId: 'tenant-123',
            moduleKey: 'sales',
        });
        expect(data).toBeDefined();
        expect(prisma.usageEvent.count).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: 'tenant-123',
                    moduleKey: 'sales',
                }),
            }),
        );
    });

    it('resolves activeUsersToday names per tenant DB and isolates per-tenant failures', async () => {
        vi.mocked(prisma.usageEvent.count).mockResolvedValue(0);
        vi.mocked(prisma.usageEvent.groupBy).mockResolvedValue([]);

        vi.mocked(prisma.tenant.findMany)
            .mockResolvedValueOnce([]) // main tenants list (unused in this test)
            .mockResolvedValueOnce([
                {
                    id: 'tenant-1',
                    name: 'Tenant Alpha',
                    subdomain: 'alpha',
                    dbUrl: 'postgres://tenant1',
                },
                {
                    id: 'tenant-2',
                    name: 'Tenant Beta',
                    subdomain: 'beta',
                    dbUrl: 'postgres://tenant2',
                },
                // tenant-3 intentionally omitted to simulate a tenant that no
                // longer exists (e.g. deleted between the raw query and lookup)
            ] as never);

        vi.mocked(prisma.$queryRaw)
            .mockResolvedValueOnce([{ count: BigInt(0) }]) // curr active users
            .mockResolvedValueOnce([{ count: BigInt(0) }]) // prev active users
            .mockResolvedValueOnce([]) // top features raw
            .mockResolvedValueOnce([]) // tenant summaries raw
            .mockResolvedValueOnce([
                {
                    tenantId: 'tenant-1',
                    userId: 'user-a',
                    viewCount: BigInt(5),
                    lastActiveAt: new Date('2026-08-13T02:00:00Z'),
                },
                {
                    tenantId: 'tenant-1',
                    userId: 'user-b', // not found in tenant-1's User table
                    viewCount: BigInt(2),
                    lastActiveAt: new Date('2026-08-13T01:00:00Z'),
                },
                {
                    tenantId: 'tenant-2', // tenant DB unreachable
                    userId: 'user-c',
                    viewCount: BigInt(1),
                    lastActiveAt: new Date('2026-08-13T03:00:00Z'),
                },
                {
                    tenantId: 'tenant-3', // tenant record no longer exists
                    userId: 'user-d',
                    viewCount: BigInt(1),
                    lastActiveAt: new Date('2026-08-13T00:30:00Z'),
                },
            ]) // active users today raw
            .mockResolvedValueOnce([]); // daily trends raw

        const tenant1Db = {
            user: {
                findMany: vi
                    .fn()
                    .mockResolvedValue([
                        { id: 'user-a', name: 'Alice', email: 'alice@alpha.test' },
                    ]),
            },
        };
        const tenant2Db = {
            user: {
                findMany: vi
                    .fn()
                    .mockRejectedValue(new Error('tenant DB unreachable')),
            },
        };
        vi.mocked(getTenantDb).mockImplementation((dbUrl: string) => {
            if (dbUrl === 'postgres://tenant1') return tenant1Db as never;
            if (dbUrl === 'postgres://tenant2') return tenant2Db as never;
            throw new Error(`unexpected dbUrl ${dbUrl}`);
        });

        const data = await UsageAnalyticsService.getAnalytics({ range: '7d' });

        // tenant-2 (DB down) and tenant-3 (missing tenant record) are dropped
        expect(data.activeUsersToday).toHaveLength(2);
        expect(
            data.activeUsersToday.some((u) => u.tenantId === 'tenant-2'),
        ).toBe(false);
        expect(
            data.activeUsersToday.some((u) => u.tenantId === 'tenant-3'),
        ).toBe(false);

        const userA = data.activeUsersToday.find((u) => u.userId === 'user-a');
        expect(userA).toMatchObject({
            tenantName: 'Tenant Alpha',
            userName: 'Alice',
            userEmail: 'alice@alpha.test',
            viewCount: 5,
        });

        const userB = data.activeUsersToday.find((u) => u.userId === 'user-b');
        expect(userB).toMatchObject({
            userName: 'user-b',
            userEmail: '-',
            viewCount: 2,
        });

        // Sorted by lastActiveAt descending
        expect(data.activeUsersToday[0].userId).toBe('user-a');
        expect(data.activeUsersToday[1].userId).toBe('user-b');
    });
});
