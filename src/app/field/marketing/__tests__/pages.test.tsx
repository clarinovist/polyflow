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

const available = <T,>(value: T) => ({ status: 'AVAILABLE' as const, data: value });
const data = {
    generatedAt: '2026-10-07T03:00:00.000Z',
    businessDate: '2026-10-07',
    period: { year: 2026, month: 10 },
    sections: {
        team: available({
            target: {
                orders: {
                    target: 3,
                    actual: 2,
                    gap: 1,
                    achievementPercent: 66.67,
                },
                visits: {
                    target: 5,
                    actual: 4,
                    gap: 1,
                    achievementPercent: 80,
                },
            },
            members: {
                total: 1,
                returned: 1,
                items: [
                    {
                        id: 'sales-1',
                        name: 'Sales Synthetic',
                        orders: {
                            target: 3,
                            actual: 2,
                            gap: 1,
                            achievementPercent: 66.67,
                        },
                        visits: {
                            target: 5,
                            actual: 4,
                            gap: 1,
                            achievementPercent: 80,
                        },
                    },
                ],
            },
        }),
        compliance: available({
            total: 1,
            returned: 1,
            items: [
                {
                    id: 'sales-1',
                    salesName: 'Sales Synthetic',
                    assigned: 3,
                    visited: 2,
                    extraCalls: 0,
                    compliancePercent: 67,
                },
            ],
        }),
        pipelineExceptions: available({
            total: 1,
            returned: 1,
            items: [
                {
                    id: 'quote-1',
                    orderNumber: 'Q-SYNTH',
                    customerName: 'Customer Synthetic',
                    salesName: 'Sales Synthetic',
                    reason: 'FOLLOW_UP_DUE',
                    dueAt: '2026-10-06T00:00:00.000Z',
                },
            ],
        }),
        reviews: available({
            total: 2,
            returned: 1,
            items: [
                {
                    id: 'prospect-1',
                    kind: 'PROSPECT',
                    title: 'Prospek Synthetic',
                    salesName: 'Sales Synthetic',
                    queuedAt: '2026-10-01T00:00:00.000Z',
                },
            ],
        }),
        customersWithoutFollowUp: available({
            total: 1,
            returned: 1,
            items: [
                {
                    id: 'customer-1',
                    customerName: 'Customer Lama',
                    city: null,
                    salesName: 'Sales Synthetic',
                    inactiveSince: '2026-09-01T00:00:00.000Z',
                },
            ],
        }),
        tasks: available({
            total: 4,
            returned: 1,
            items: [
                {
                    id: 'quote-1',
                    kind: 'PIPELINE',
                    title: 'Q-SYNTH',
                    subtitle: 'Customer Synthetic · Sales Synthetic',
                    priority: 'URGENT',
                    occurredAt: '2026-10-06T00:00:00.000Z',
                },
            ],
        }),
        receivables: available({ overdueCount: 3 }),
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

    it('shows bounded task total without mutation controls', async () => {
        render(await MarketingHome());
        expect(screen.getByText('1 dari 4')).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
        expect(screen.queryByRole('link')).toBeNull();
    });

    it('keeps whole-composer failure distinct from a zero dashboard', async () => {
        m.overview.mockResolvedValue({ success: false });
        render(await MarketingHome());
        expect(screen.getByRole('alert').textContent).toContain(
            'Ringkasan marketing belum tersedia',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(m.refresh).toHaveBeenCalledOnce();
    });

    it('renders an unavailable home section beside healthy peers', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...data,
                sections: {
                    ...data.sections,
                    pipelineExceptions: {
                        status: 'UNAVAILABLE',
                        data: null,
                    },
                },
            },
        });
        render(await MarketingHome());
        expect(
            screen.getByText('Pipeline perlu perhatian tidak tersedia'),
        ).toBeTruthy();
        expect(screen.getByText('Menunggu Review')).toBeTruthy();
        expect(screen.getByText('Q-SYNTH')).toBeTruthy();
    });

    it('renders one unavailable section on the other three pages beside peers', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...data,
                sections: {
                    ...data.sections,
                    compliance: { status: 'UNAVAILABLE', data: null },
                    reviews: { status: 'UNAVAILABLE', data: null },
                    receivables: { status: 'UNAVAILABLE', data: null },
                },
            },
        });
        render(await MarketingTeam());
        expect(screen.getByText('Compliance rute tidak tersedia')).toBeTruthy();
        expect(screen.getByText('Sales Synthetic')).toBeTruthy();
        cleanup();
        render(await MarketingReviews());
        expect(
            screen.getByText('Review prospek dan kunjungan tidak tersedia'),
        ).toBeTruthy();
        expect(screen.getByText('Customer Lama')).toBeTruthy();
        cleanup();
        render(await MarketingInsights());
        expect(screen.getByText('Piutang overdue tidak tersedia')).toBeTruthy();
        expect(screen.getByText('Q-SYNTH')).toBeTruthy();
    });

    it('omits nominal labels without fields and renders them only when present', async () => {
        render(await MarketingTeam());
        expect(screen.queryByText(/Omzet/)).toBeNull();
        cleanup();
        render(await MarketingInsights());
        expect(screen.queryByText(/^Rp/)).toBeNull();

        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...data,
                sections: {
                    ...data.sections,
                    receivables: available({
                        overdueCount: 3,
                        overdueAmount: 750,
                    }),
                    pipelineExceptions: available({
                        ...data.sections.pipelineExceptions.data,
                        items: [
                            {
                                ...data.sections.pipelineExceptions.data
                                    .items[0],
                                amount: 750,
                            },
                        ],
                    }),
                },
            },
        });
        cleanup();
        render(await MarketingInsights());
        expect(screen.getAllByText(/Rp/).length).toBeGreaterThan(0);
    });
});
