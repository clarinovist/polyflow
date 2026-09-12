// @vitest-environment jsdom

import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecutiveStats } from '@/services/dashboard/executive-stats-service';
import { getDashboardPresentation } from '@/lib/dashboard/role-dashboard-config';
import DashboardClient from '../DashboardClient';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh }),
}));

const stats: ExecutiveStats = {
    sales: {
        mtdRevenue: 100_000,
        activeOrders: 1,
        pendingInvoices: 0,
        trend: 0,
    },
    purchasing: { mtdSpending: 50_000, pendingPOs: 0, trend: 0 },
    production: {
        activeJobs: 0,
        delayedJobs: 0,
        completionRate: 100,
        yieldRate: 100,
        totalScrapKg: 0,
        downtimeHours: 0,
        runningMachines: 0,
        totalMachines: 0,
        trend: 0,
    },
    inventory: {
        totalValue: 0,
        lowStockCount: 0,
        totalItems: 0,
        trend: 0,
    },
    cashflow: {
        overdueReceivables: 0,
        overduePayables: 0,
        invoicesDueThisWeek: 0,
    },
    revenueTrendChart: [],
};

const presentation = {
    currentDate: 'Sabtu, 12 September 2026',
    greeting: 'Selamat malam',
    encouragement: 'Pesan dashboard yang stabil.',
    lastUpdated: '21.00 WIB',
};

const defaultProps = {
    stats,
    ceoNotes: [],
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

    it('keeps the empty CEO-note state compact and omits module sitemap shortcuts', () => {
        const html = renderToStaticMarkup(<DashboardClient {...defaultProps} />);

        expect(html).toContain('Belum ada catatan — bagus.');
        expect(html).not.toContain('border-dashed');
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
                    cashflow: {
                        ...stats.cashflow,
                        overdueReceivables: 10_000,
                    },
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
