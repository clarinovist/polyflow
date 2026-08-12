// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { UsageAnalyticsClient } from '../usage-analytics-client';
import { UsageAnalyticsOverviewData } from '@/services/admin/usage-analytics.service';

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
        topFeatures: [],
        tenantSummaries: [],
        dailyTrends: [
            { date: '2026-08-08', totalViews: 117, activeUsers: 4, activeTenants: 2 },
            { date: '2026-08-09', totalViews: 30, activeUsers: 2, activeTenants: 1 },
        ],
        availableTenants: [],
        availableModules: [],
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
});
