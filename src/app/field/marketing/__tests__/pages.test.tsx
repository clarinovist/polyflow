// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketingHome from '../page';
import MarketingTeam from '../team/page';
import MarketingReviews from '../reviews/page';
import MarketingInsights from '../insights/page';

const m = vi.hoisted(() => ({
    overview: vi.fn(),
    guard: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock('@/actions/sales/mobile-marketing', () => ({
    getMarketingMobileOverview: m.overview,
}));
vi.mock('@/lib/mobile/mobile-portal-page-access', () => ({
    requireMobilePortalPageAccess: m.guard,
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: m.refresh }),
}));

const data = {
    generatedAt: '2026-10-07T03:00:00.000Z',
    businessDate: '2026-10-07',
    period: { year: 2026, month: 10 },
    highlights: {
        teamMemberCount: 1,
        pipelineExceptionCount: 1,
        pendingReviewCount: 2,
        customersWithoutFollowUpCount: 1,
        overdueReceivableCount: 3,
    },
    teamTarget: {
        orders: { target: 3, actual: 2, gap: 1, achievementPercent: 66.67 },
        visits: { target: 5, actual: 4, gap: 1, achievementPercent: 80 },
    },
    team: {
        total: 1,
        returned: 1,
        items: [{
            id: 'sales-1',
            name: 'Sales Synthetic',
            orders: { target: 3, actual: 2, gap: 1, achievementPercent: 66.67 },
            visits: { target: 5, actual: 4, gap: 1, achievementPercent: 80 },
        }],
    },
    compliance: {
        total: 1,
        returned: 1,
        items: [{
            id: 'sales-1',
            salesName: 'Sales Synthetic',
            assigned: 3,
            visited: 2,
            extraCalls: 0,
            compliancePercent: 67,
        }],
    },
    pipelineExceptions: {
        total: 1,
        returned: 1,
        items: [{
            id: 'quote-1',
            orderNumber: 'Q-SYNTH',
            customerName: 'Customer Synthetic',
            salesName: 'Sales Synthetic',
            reason: 'FOLLOW_UP_DUE',
            dueAt: '2026-10-06T00:00:00.000Z',
        }],
    },
    reviews: {
        total: 2,
        returned: 2,
        items: [{
            id: 'prospect-1',
            kind: 'PROSPECT',
            title: 'Prospek Synthetic',
            salesName: 'Sales Synthetic',
            queuedAt: '2026-10-01T00:00:00.000Z',
        }],
    },
    customersWithoutFollowUp: {
        total: 1,
        returned: 1,
        items: [{
            id: 'customer-1',
            customerName: 'Customer Lama',
            city: null,
            salesName: 'Sales Synthetic',
            inactiveSince: '2026-09-01T00:00:00.000Z',
        }],
    },
    tasks: {
        total: 4,
        returned: 1,
        items: [{
            id: 'quote-1',
            kind: 'PIPELINE',
            title: 'Q-SYNTH',
            subtitle: 'Customer Synthetic · Sales Synthetic',
            priority: 'URGENT',
            occurredAt: '2026-10-06T00:00:00.000Z',
        }],
    },
} as const;

beforeEach(() => {
    vi.resetAllMocks();
    m.guard.mockResolvedValue({});
    m.overview.mockResolvedValue({ success: true, data });
});
afterEach(cleanup);

describe('marketing mobile pages', () => {
    it.each([
        ['home', MarketingHome],
        ['team', MarketingTeam],
        ['reviews', MarketingReviews],
        ['insights', MarketingInsights],
    ])('%s has one H1 and directly guards the route', async (_name, Page) => {
        render(await Page());
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(m.guard).toHaveBeenCalledWith('marketing-supervisor');
    });

    it('shows full total versus bounded initial task sample without mutation controls', async () => {
        render(await MarketingHome());
        expect(screen.getByText('1 dari 4')).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('keeps expected read failure distinct from a zero dashboard', async () => {
        m.overview.mockResolvedValue({ success: false });
        render(await MarketingHome());
        expect(screen.getByRole('alert').textContent).toContain(
            'Ringkasan marketing belum tersedia',
        );
        expect(screen.queryByText('Piutang Overdue')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(m.refresh).toHaveBeenCalledOnce();
    });

    it('does not render nominal labels when amounts are absent from the DTO', async () => {
        render(await MarketingTeam());
        expect(screen.queryByText(/Omzet/)).toBeNull();
        cleanup();
        render(await MarketingInsights());
        expect(screen.queryByText(/^Rp/)).toBeNull();
    });

    it('renders nominal fields only when they are present in the server DTO', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...data,
                highlights: {
                    ...data.highlights,
                    overdueReceivableAmount: 750,
                },
                teamTarget: {
                    ...data.teamTarget,
                    revenue: {
                        targetAmount: 1000,
                        actualAmount: 750,
                        gapAmount: 250,
                        achievementPercent: 75,
                    },
                },
                team: {
                    ...data.team,
                    items: [
                        {
                            ...data.team.items[0],
                            revenue: {
                                targetAmount: 1000,
                                actualAmount: 750,
                                gapAmount: 250,
                                achievementPercent: 75,
                            },
                        },
                    ],
                },
                pipelineExceptions: {
                    ...data.pipelineExceptions,
                    items: [
                        {
                            ...data.pipelineExceptions.items[0],
                            amount: 750,
                        },
                    ],
                },
            },
        });

        render(await MarketingTeam());
        expect(screen.getAllByText(/Rp/).length).toBeGreaterThan(0);
        cleanup();
        render(await MarketingInsights());
        expect(screen.getAllByText(/Rp/).length).toBeGreaterThan(0);
    });
});
