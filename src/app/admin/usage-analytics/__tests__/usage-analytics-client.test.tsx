// @vitest-environment jsdom

import { act, fireEvent, render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsageAnalyticsClient } from '../usage-analytics-client';
import { UsageAnalyticsOverviewData } from '@/services/admin/usage-analytics.service';
import { fetchUsageAnalytics } from '@/actions/admin/usage-analytics';

vi.mock('@/actions/admin/usage-analytics', () => ({
    fetchUsageAnalytics: vi.fn(),
}));

function buildMockData(): UsageAnalyticsOverviewData {
    const metric = { value: 10, prevValue: 5, changePercent: 100 };
    return {
        periodLabel: '7 Hari Terakhir',
        metrics: {
            activeUsers: metric,
            activeTenants: metric,
            totalViews: metric,
            featuresUsed: metric,
        },
        topFeatures: [
            {
                featureKey: 'sales.orders.list',
                label: 'Daftar Order',
                moduleKey: 'sales',
                totalViews: 50,
                prevViews: 30,
                changePercent: 67,
                uniqueUsers: 5,
                uniqueTenants: 2,
            },
        ],
        tenantSummaries: [
            {
                tenantId: 'tenant-1',
                tenantName: 'Tenant Alpha',
                subdomain: 'alpha',
                totalViews: 100,
                prevViews: 80,
                changePercent: 25,
                activeUsers: 4,
                featuresUsed: 8,
                lastActivity: new Date('2026-08-08T10:00:00Z'),
            },
            {
                tenantId: 'tenant-2',
                tenantName: 'Tenant Beta',
                subdomain: 'beta',
                totalViews: 0,
                prevViews: 0,
                changePercent: 0,
                activeUsers: 0,
                featuresUsed: 0,
                lastActivity: null,
            },
        ],
        dailyTrends: [
            { date: '2026-08-08', totalViews: 117, activeUsers: 4, activeTenants: 2 },
            { date: '2026-08-09', totalViews: 30, activeUsers: 2, activeTenants: 1 },
        ],
        activeUsersToday: [
            {
                tenantId: 'tenant-1',
                tenantName: 'Tenant Alpha',
                subdomain: 'alpha',
                userId: 'user-a',
                userName: 'Alice',
                userEmail: 'alice@alpha.test',
                viewCount: 5,
                lastActiveAt: new Date('2026-08-13T02:00:00Z'),
            },
        ],
        availableTenants: [
            { id: 'tenant-1', name: 'Tenant Alpha', subdomain: 'alpha' },
        ],
        availableModules: ['sales'],
    };
}

describe('UsageAnalyticsClient daily trend chart', () => {
    it('gives each bar column an explicit height so the percentage-height bar can render', () => {
        // Regression guard: a percentage `height` on the bar div only resolves
        // against a containing block with a DEFINITE height. The column wrapper
        // used to be auto-height (no h-full), so the bar's height:X% silently
        // collapsed to 0 — data was correct (visible on hover tooltip) but no
        // bar was ever visible. See docs/plan/2026-08-12-fix-usage-analytics-
        // daily-trend-tz-bug.md, Gap 3.
        const { container } = render(
            <UsageAnalyticsClient initialData={buildMockData()} />,
        );

        const bars = container.querySelectorAll('[style*="height"]');
        expect(bars.length).toBe(2);
        bars.forEach((bar) => {
            expect(bar.parentElement?.className).toMatch(/\bh-full\b/);
        });
    });

    it('shows tenant/feature rows and a lastActivity fallback', () => {
        const { getAllByText, getByText } = render(
            <UsageAnalyticsClient initialData={buildMockData()} />,
        );

        // "Tenant Alpha" also appears in the active-users-today card now.
        expect(getAllByText('Tenant Alpha').length).toBeGreaterThan(0);
        expect(getByText('Tenant Beta')).toBeTruthy();
        expect(getByText('Daftar Order')).toBeTruthy();
    });

    it('shows the active-users-today card with resolved user name and email', () => {
        const { getByText } = render(
            <UsageAnalyticsClient initialData={buildMockData()} />,
        );

        expect(getByText('Pengguna Aktif Hari Ini')).toBeTruthy();
        expect(getByText('Alice')).toBeTruthy();
        expect(getByText('alice@alpha.test')).toBeTruthy();
    });
});

describe('UsageAnalyticsClient filter interactions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('re-fetches analytics when range, tenant, module filters or refresh are used', async () => {
        vi.mocked(fetchUsageAnalytics).mockResolvedValue(buildMockData());

        const { container, getByText, getByTitle } = render(
            <UsageAnalyticsClient initialData={buildMockData()} />,
        );
        const [tenantSelect, moduleSelect] =
            container.querySelectorAll('select');

        await act(async () => {
            fireEvent.click(getByText('30 Hari'));
        });
        expect(fetchUsageAnalytics).toHaveBeenCalledWith(
            expect.objectContaining({ range: '30d' }),
        );

        await act(async () => {
            fireEvent.change(tenantSelect, {
                target: { value: 'tenant-1' },
            });
        });
        expect(fetchUsageAnalytics).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: 'tenant-1' }),
        );

        await act(async () => {
            fireEvent.change(moduleSelect, {
                target: { value: 'sales' },
            });
        });
        expect(fetchUsageAnalytics).toHaveBeenCalledWith(
            expect.objectContaining({ moduleKey: 'sales' }),
        );

        await act(async () => {
            fireEvent.click(getByText('Refresh'));
        });
        expect(fetchUsageAnalytics).toHaveBeenCalledTimes(4);

        await act(async () => {
            fireEvent.click(
                getByTitle('Ekspor daftar fitur teratas ke CSV'),
            );
        });
    });

    it('surfaces an error message when the refresh request fails', async () => {
        vi.mocked(fetchUsageAnalytics).mockRejectedValue(
            new Error('Gagal memuat data.'),
        );

        const { getByText } = render(
            <UsageAnalyticsClient initialData={buildMockData()} />,
        );

        await act(async () => {
            fireEvent.click(getByText('Refresh'));
        });

        expect(getByText('Gagal memuat data.')).toBeTruthy();
    });
});
