// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    overview: vi.fn(),
    routeProps: vi.fn(),
    pipelineProps: vi.fn(),
    followUpProps: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/actions/sales/mobile-field-sales', () => ({
    getFieldSalesMobileOverview: m.overview,
}));
vi.mock('@/components/sales/mobile/VisitSyncBanner', () => ({
    VisitSyncBanner: () => <div>Sync kunjungan</div>,
}));
vi.mock('@/components/field/RouteTodaySection', () => ({
    RouteTodaySection: (props: unknown) => {
        m.routeProps(props);
        return <div>Rute Hari Ini</div>;
    },
}));
vi.mock('@/components/field/FollowUpTodaySection', () => ({
    FollowUpTodaySection: (props: unknown) => {
        m.followUpProps(props);
        return <div>Follow-up Hari Ini</div>;
    },
}));
vi.mock('@/components/field/PipelineSummaryCard', () => ({
    PipelineSummaryCard: (props: unknown) => {
        m.pipelineProps(props);
        return <div>Pipeline Saya</div>;
    },
}));

import FieldSalesDashboardPage from '../page';

const available = <T,>(data: T) => ({ status: 'AVAILABLE' as const, data });
const data = {
    generatedAt: '2026-10-10T03:00:00.000Z',
    businessDate: '2026-10-10',
    greeting: 'Selamat pagi',
    displayDate: 'Sabtu, 10 Okt 2026',
    sections: {
        route: available(null),
        followUps: available({ total: 0, returned: 0, items: [] }),
        compliance: available({
            assigned: 0,
            completed: 0,
            extraCalls: 0,
            compliance: 0,
        }),
        pipeline: available({
            total: 0,
            returned: 0,
            items: [],
            activeCount: 0,
            openQuotationCount: 0,
            nominal: { status: 'HIDDEN', data: null },
        }),
        activeCustomers: available([]),
        receivables: available({
            total: 2,
            overdueCount: 1,
            href: null,
            nominal: { status: 'HIDDEN', data: null },
        }),
    },
};

beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({
        user: { id: 'sales-1', tenantId: 'tenant-1', name: 'Synthetic Sales' },
    });
    m.overview.mockResolvedValue({ success: true, data });
});
afterEach(cleanup);

describe('Field Sales root page', () => {
    it('calls one overview action and keeps today-first order and server business date', async () => {
        render(await FieldSalesDashboardPage());
        expect(m.overview).toHaveBeenCalledOnce();
        expect(m.routeProps).toHaveBeenCalledWith(
            expect.objectContaining({ businessDate: '2026-10-10' }),
        );
        const text = document.body.textContent ?? '';
        expect(text.indexOf('Selamat pagi')).toBeLessThan(
            text.indexOf('Rute Hari Ini'),
        );
        expect(text.indexOf('Rute Hari Ini')).toBeLessThan(
            text.indexOf('Follow-up Hari Ini'),
        );
        expect(text.indexOf('Follow-up Hari Ini')).toBeLessThan(
            text.indexOf('Pipeline Saya'),
        );
        expect(text.indexOf('Pipeline Saya')).toBeLessThan(
            text.indexOf('Order Baru'),
        );
        expect(screen.getByText('Terakhir diperbarui', { exact: false })).toBeTruthy();
    });

    it('renders one unavailable section beside healthy peers and keeps valid zero', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...data,
                sections: {
                    ...data.sections,
                    followUps: { status: 'UNAVAILABLE', data: null },
                },
            },
        });
        render(await FieldSalesDashboardPage());
        expect(screen.getByText('Follow-up hari ini tidak tersedia')).toBeTruthy();
        expect(screen.getByText('Pipeline Saya')).toBeTruthy();
        expect(screen.getByText('Order Aktif')).toBeTruthy();
        expect(screen.getByText('0')).toBeTruthy();
    });

    it('keeps a valid route visible when only active-customer fallback fails', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...data,
                sections: {
                    ...data.sections,
                    route: available({
                        id: 'route-1',
                        date: '2026-10-10',
                        status: 'PUBLISHED',
                        items: [],
                    }),
                    activeCustomers: { status: 'UNAVAILABLE', data: null },
                },
            },
        });

        render(await FieldSalesDashboardPage());
        expect(screen.getByText('Rute Hari Ini')).toBeTruthy();
        expect(
            screen.getByText('Daftar customer aktif tidak tersedia'),
        ).toBeTruthy();
        expect(screen.queryByText('Rute hari ini tidak tersedia')).toBeNull();
        expect(m.routeProps).toHaveBeenCalledWith(
            expect.objectContaining({ activeCustomers: [] }),
        );
    });

    it('keeps non-price AR count but exposes no amount href or nominal placeholder', async () => {
        render(await FieldSalesDashboardPage());
        expect(screen.getByText('Piutang aktif')).toBeTruthy();
        expect(screen.getByText('2')).toBeTruthy();
        expect(screen.queryByText(/^Rp/)).toBeNull();
        const hrefs = screen
            .getAllByRole('link')
            .map((link) => link.getAttribute('href'));
        expect(hrefs.every((href) => href?.startsWith('/field/sales/'))).toBe(
            true,
        );
        expect(hrefs).not.toContain('/field/sales/receivables');
    });
});
