// @vitest-environment jsdom

import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecutiveStats } from '@/services/dashboard/executive-stats-service';
import { getDashboardPresentation } from '@/lib/dashboard/role-dashboard-config';
import DashboardClient from '../DashboardClient';

const refresh = vi.fn();

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh }),
}));

const stats: ExecutiveStats = {
    generatedAt: '2026-09-12T14:00:00.000Z',
    sections: {
        sales: 'AVAILABLE',
        purchasing: 'AVAILABLE',
        production: 'AVAILABLE',
        inventory: 'AVAILABLE',
        finance: 'AVAILABLE',
    },
    sales: {
        mtdRevenue: 100_000,
        activeOrders: 1,
        pendingInvoices: 0,
        overdueReceivables: 0,
        invoicesDueThisWeek: 0,
        trend: 0,
        revenueTrendChart: [],
    },
    purchasing: {
        mtdSpending: 50_000,
        pendingPOs: 0,
        overduePayables: 0,
        trend: 0,
    },
    production: {
        activeJobs: 0,
        delayedJobs: 0,
        completionRate: 100,
        totalScrap: null,
        scrapStatus: 'NOT_CONFIGURED',
        downtimeHours: 0,
        runningMachines: 0,
        totalMachines: 0,
        trend: 0,
    },
    inventory: {
        totalValue: null,
        valuationStatus: 'NOT_CONFIGURED',
        lowStockCount: 0,
        totalItems: 0,
        trend: 0,
    },
    finance: {
        mtdRevenue: 100_000,
        revenueTrend: 0,
        mtdNetIncome: 30_000,
        netIncomeTrend: 0,
        mtdSpending: 50_000,
        spendingTrend: 0,
        cashBalance: 75_000,
        cashAsOfDate: '2026-09-12',
        pendingInvoices: 0,
        overdueReceivables: 0,
        overdueReceivablesCount: 0,
        overduePayables: 0,
        overduePayablesCount: 0,
        invoicesDueThisWeek: 0,
        revenueTrendChart: [],
        netIncomeTrendChart: [],
    },
};

const presentation = {
    currentDate: 'Sabtu, 12 September 2026',
    greeting: 'Selamat malam',
    encouragement: 'Pesan dashboard yang stabil.',
    lastUpdated: '21.00 WIB',
};

const defaultProps = {
    stats,
    userName: 'Budi Santoso',
    userRole: 'ADMIN',
    permissions: 'ALL' as const,
    presentation,
};

afterEach(() => {
    vi.useRealTimers();
    refresh.mockClear();
});

describe('DashboardClient hydration safety', () => {
    it('builds the presentation snapshot in Asia/Jakarta', () => {
        expect(
            getDashboardPresentation(
                new Date('2026-09-12T14:00:00.000Z'),
            ),
        ).toMatchObject({
            currentDate: 'Sabtu, 12 September 2026',
            greeting: 'Selamat malam',
        });
    });

    it('renders only the server-provided Jakarta presentation snapshot', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-12T14:00:00.000Z'));

        const html = renderToStaticMarkup(
            <DashboardClient
                {...defaultProps}
            />,
        );

        expect(html).toContain(presentation.currentDate);
        expect(html).toContain(`${presentation.greeting}, Budi`);
        expect(html).toContain(presentation.encouragement);
        expect(html).toContain('Terakhir diperbarui');
        expect(html).toContain(presentation.lastUpdated);
    });

    it('orders condition, attention, then direction and exposes metric definitions', () => {
        const statsWithTrend: ExecutiveStats = {
            ...stats,
            finance: stats.finance
                ? {
                      ...stats.finance,
                      revenueTrendChart: [
                          { month: '2026-06', revenue: 70_000 },
                          { month: '2026-07', revenue: 80_000 },
                          { month: '2026-08', revenue: 90_000 },
                          { month: '2026-09', revenue: 100_000 },
                      ],
                      netIncomeTrendChart: [
                          { month: '2026-06', netIncome: 10_000 },
                          { month: '2026-07', netIncome: 20_000 },
                          { month: '2026-08', netIncome: 25_000 },
                          { month: '2026-09', netIncome: 30_000 },
                      ],
                  }
                : null,
        };
        render(<DashboardClient {...defaultProps} stats={statsWithTrend} />);

        const text = document.body.textContent ?? '';
        expect(text.indexOf('Kondisi')).toBeLessThan(
            text.indexOf('Perlu perhatian'),
        );
        expect(text.indexOf('Perlu perhatian')).toBeLessThan(
            text.indexOf('Arah utama'),
        );
        expect(screen.queryByText('Health')).toBeNull();
        expect(screen.queryByText('Attention')).toBeNull();
        expect(screen.queryByText('Drivers')).toBeNull();
        const revenueInfo = screen.getByRole('button', {
            name: 'Penjelasan Pendapatan Aktual',
        });
        expect(revenueInfo).toBeDefined();
        expect(
            screen.queryByText(/POSTED|target\/on-target|COGS/i),
        ).toBeNull();
        fireEvent.click(revenueInfo, { detail: 1 });
        expect(
            screen.getByRole('tooltip').textContent,
        ).toContain('Pendapatan usaha yang sudah tercatat');
        expect(screen.getByRole('tooltip').textContent).not.toMatch(
            /POSTED|target\/on-target|COGS/i,
        );
        expect(screen.getByText('Tren laba rugi bulanan')).toBeDefined();
        expect(screen.getByText(/Target belum tersedia/)).toBeDefined();
    });

    it('withholds directions until four comparable points exist', () => {
        render(<DashboardClient {...defaultProps} />);

        expect(screen.queryByText('Arah utama')).toBeNull();
        expect(screen.queryByText('Tren laba rugi bulanan')).toBeNull();
        expect(screen.getByText('Tidak ada pengecualian aktif')).toBeDefined();
        expect(
            screen.getByText(
                'Tidak ada sinyal lintas divisi yang memerlukan perhatian pada kondisi saat ini.',
            ),
        ).toBeDefined();
        expect(screen.queryByText(/exception|signal|snapshot/i)).toBeNull();
    });

    it('withholds directions when canonical series are not aligned', () => {
        render(
            <DashboardClient
                {...defaultProps}
                stats={{
                    ...stats,
                    finance: stats.finance
                        ? {
                              ...stats.finance,
                              revenueTrendChart: [
                                  { month: '2026-06', revenue: 70_000 },
                                  { month: '2026-07', revenue: 80_000 },
                                  { month: '2026-08', revenue: 90_000 },
                                  { month: '2026-09', revenue: 100_000 },
                              ],
                              netIncomeTrendChart: [
                                  { month: '2026-06', netIncome: 10_000 },
                                  { month: '2026-07', netIncome: 20_000 },
                                  { month: '2026-08', netIncome: 25_000 },
                              ],
                          }
                        : null,
                }}
            />,
        );

        expect(screen.queryByText('Arah utama')).toBeNull();
    });

    it('renders NOT_CONFIGURED valuation honestly for a permitted warehouse role', () => {
        render(
            <DashboardClient
                {...defaultProps}
                userRole="WAREHOUSE"
                permissions="ALL"
            />,
        );

        expect(screen.getByText('Belum disiapkan')).toBeDefined();
        expect(
            screen.getByText(/Metrik ditahan sampai definisi bisnis disetujui/),
        ).toBeDefined();
    });

    it('renders ordered aggregate attention with owner modules and separate units', () => {
        render(
            <DashboardClient
                {...defaultProps}
                stats={{
                    ...stats,
                    finance: stats.finance
                        ? {
                              ...stats.finance,
                              overdueReceivables: 15_000,
                              overdueReceivablesCount: 2,
                              overduePayables: 8_000,
                              overduePayablesCount: 1,
                          }
                        : null,
                    production: stats.production
                        ? { ...stats.production, delayedJobs: 3 }
                        : null,
                    inventory: stats.inventory
                        ? { ...stats.inventory, lowStockCount: 4 }
                        : null,
                    purchasing: stats.purchasing
                        ? { ...stats.purchasing, pendingPOs: 5 }
                        : null,
                }}
            />,
        );

        const attention = screen
            .getByRole('heading', { name: 'Tindakan berikutnya' })
            .closest('section')?.textContent ?? '';
        expect(attention.indexOf('Piutang jatuh tempo')).toBeLessThan(
            attention.indexOf('Hutang jatuh tempo'),
        );
        expect(attention).toContain('2 tagihan melewati jatuh tempo');
        expect(attention).not.toMatch(
            /overdue|invoice|INTERNAL RM\/FG|planned end|DRAFT|SENT/i,
        );
        expect(attention).toContain('4');
        expect(attention).not.toContain('32.000');
    });

    it('removes retired CEO notes while preserving dashboard actions', () => {
        const html = renderToStaticMarkup(<DashboardClient {...defaultProps} />);

        expect(html).not.toContain('Catatan CEO');
        expect(html).not.toContain('Belum ada catatan — bagus.');
        expect(html).not.toContain('/ceo-notes');
        expect(html).not.toContain('Pintasan Modul');
        expect(html).not.toContain('Master Data');
        expect(html).toContain('Aksi Cepat');
    });

    it('keeps the server snapshot timestamp until refreshed props arrive', () => {
        const view = render(<DashboardClient {...defaultProps} />);

        expect(screen.getByText(/Terakhir diperbarui 21\.00 WIB/)).toBeDefined();
        fireEvent.click(
            screen.getByRole('button', { name: 'Segarkan data dashboard' }),
        );

        expect(refresh).toHaveBeenCalledOnce();
        expect(screen.getByText(/Terakhir diperbarui 21\.00 WIB/)).toBeDefined();

        view.rerender(
            <DashboardClient
                {...defaultProps}
                stats={{
                    ...stats,
                    generatedAt: '2026-09-12T14:07:00.000Z',
                }}
                presentation={{ ...presentation, lastUpdated: '21.07 WIB' }}
            />,
        );
        expect(screen.getByText(/Terakhir diperbarui 21\.07 WIB/)).toBeDefined();
    });

    it('hydrates the server markup without a hydration mismatch', async () => {
        const container = document.createElement('div');
        container.innerHTML = renderToString(
            <DashboardClient {...defaultProps} />,
        );
        document.body.appendChild(container);
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        let root: ReturnType<typeof hydrateRoot> | undefined;
        await act(async () => {
            root = hydrateRoot(container, <DashboardClient {...defaultProps} />);
        });

        expect(container.textContent).toContain('Selamat malam, Budi');
        expect(
            consoleError.mock.calls.some((call) =>
                call.some((value) =>
                    String(value).toLowerCase().includes('hydration'),
                ),
            ),
        ).toBe(false);

        await act(async () => root?.unmount());
        consoleError.mockRestore();
        container.remove();
    });

    it('filters KPI links and task shortcuts by their resource permissions', () => {
        const html = renderToStaticMarkup(
            <DashboardClient
                {...defaultProps}
                stats={{
                    ...stats,
                    finance: stats.finance
                        ? { ...stats.finance, overdueReceivables: 10_000 }
                        : null,
                }}
                userRole="FINANCE"
                permissions={['/finance/invoices/sales']}
            />,
        );

        expect(html).toContain('/finance/invoices/sales?overdue=true');
        expect(html).not.toContain('/finance/payments/received');
        expect(html).not.toContain('/sales/orders');
        expect(html).not.toContain('Tambah Produk');
    });

    it('uses aliases for task visibility without broadening child permissions', () => {
        const legacyAliasHtml = renderToStaticMarkup(
            <DashboardClient
                {...defaultProps}
                userRole="SALES"
                permissions={['/sales/mobile']}
            />,
        );
        expect(legacyAliasHtml).toContain('href="/field/sales"');

        const childOnlyHtml = renderToStaticMarkup(
            <DashboardClient
                {...defaultProps}
                userRole="SALES"
                permissions={['/field/sales/orders']}
            />,
        );
        expect(childOnlyHtml).not.toContain('href="/field/sales"');
        expect(childOnlyHtml).not.toContain('href="/sales/orders/create"');
        expect(childOnlyHtml).not.toContain('href="/sales/deliveries"');
    });

    it('hides a portal CTA when only a narrower destination is permitted', () => {
        const html = renderToStaticMarkup(
            <DashboardClient
                {...defaultProps}
                userRole="PRODUCTION"
                permissions={['/production/daily']}
            />,
        );

        expect(html).not.toContain('Buka Portal Produksi');
        expect(html).toContain('SPK Aktif');
        expect(html).toContain('/production/daily');
    });

    it('shows unavailable sections without rendering false-zero KPIs', () => {
        render(
            <DashboardClient
                {...defaultProps}
                stats={{
                    ...stats,
                    sections: {
                        ...stats.sections,
                        production: 'UNAVAILABLE',
                    },
                    production: null,
                }}
            />,
        );

        expect(screen.getByText('Sebagian data tidak tersedia')).toBeDefined();
        expect(
            screen.getByText(/Produksi tidak ditampilkan/),
        ).toBeDefined();
        expect(screen.queryByText('Penyelesaian SPK')).toBeNull();
        expect(screen.queryByText('0.0 jam')).toBeNull();
    });

    it('shows sections hidden by permission without an unavailable warning', () => {
        render(
            <DashboardClient
                {...defaultProps}
                userRole="HRD"
                stats={{
                    ...stats,
                    sections: {
                        sales: 'HIDDEN',
                        purchasing: 'HIDDEN',
                        production: 'HIDDEN',
                        inventory: 'HIDDEN',
                        finance: 'HIDDEN',
                    },
                    sales: null,
                    purchasing: null,
                    production: null,
                    inventory: null,
                    finance: null,
                }}
            />,
        );

        expect(screen.queryByText('Sebagian data tidak tersedia')).toBeNull();
    });

    it('renders the failure state with the page H1', () => {
        render(<DashboardClient {...defaultProps} stats={null} />);

        expect(
            screen.getByRole('heading', {
                level: 1,
                name: 'Gagal memuat statistik dashboard',
            }),
        ).toBeDefined();
    });
});
