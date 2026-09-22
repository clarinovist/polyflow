import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const captures = vi.hoisted(() => ({
    dateFilter: vi.fn(),
    period: vi.fn(),
    table: vi.fn(),
}));

vi.mock('@/actions/sales/sales', () => ({
    getSalesOrders: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getSalesOrderStats: vi.fn().mockResolvedValue({
        success: true,
        data: {
            totalOrders: 0,
            activeCount: 0,
            completedCount: 0,
            cancelledCount: 0,
            totalAmount: 0,
            activeAmount: 0,
            completedAmount: 0,
            pipelineAmount: 0,
            cancelledAmount: 0,
            shippedWeight: {
                shippedWeightKg: 400,
                shippedOrderCount: 1,
                unconvertedItemCount: 0,
                incompleteOrderCount: 0,
            },
        },
    }),
}));

vi.mock('@/actions/sales/customer', () => ({
    getCustomers: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock('@/components/common/url-transaction-date-filter', () => ({
    UrlTransactionDateFilter: (props: unknown) => {
        captures.dateFilter(props);
        return <div>Date filter</div>;
    },
}));

vi.mock('@/components/sales/OrderPeriodHint', () => ({
    OrderPeriodHint: (props: unknown) => {
        captures.period(props);
        return <div>Period hint</div>;
    },
}));

vi.mock('@/components/sales/SalesOrderTable', () => ({
    SalesOrderTable: (props: unknown) => {
        captures.table(props);
        return <div>Sales order table</div>;
    },
}));

vi.mock('@/components/sales/SalesOrderFilters', () => ({
    SalesOrderFilters: () => <div>Sales order filters</div>,
}));

vi.mock('@/components/support/contextual-help', () => ({
    ContextualHelp: () => <div>Contextual help</div>,
}));

vi.mock('next/navigation', () => ({
    redirect: vi.fn(),
}));

import SalesPage from '../page';
import { getSalesOrderStats } from '@/actions/sales/sales';

afterEach(() => {
    vi.useRealTimers();
    captures.dateFilter.mockClear();
    captures.period.mockClear();
    captures.table.mockClear();
    vi.mocked(getSalesOrderStats).mockClear();
});

describe('Sales Orders page hydration inputs', () => {
    it('replaces Total Periode with shipment kg and explains the order-date scope', async () => {
        const page = await SalesPage({ searchParams: Promise.resolve({}) });
        const html = renderToStaticMarkup(page);
        expect(html).toContain('Total Berat Terkirim');
        expect(html).toContain('400 kg');
        expect(html).toContain('Realisasi Omzet');
        expect(html).not.toContain('Total Periode');
        expect(html).toContain('bukan berdasarkan tanggal pengiriman');
    });

    it('keeps customer history all-time and table-only filters out of stats', async () => {
        const page = await SalesPage({ searchParams: Promise.resolve({
            customer: 'customer-1', status: 'SHIPPED', fulfill: 'stock', payment: 'paid',
        }) });
        const html = renderToStaticMarkup(page);
        expect(getSalesOrderStats).toHaveBeenCalledWith(undefined, 'customer-1');
        expect(html).toContain('Menampilkan seluruh riwayat order');
        expect(html).toContain('bukan filter tabel');
    });

    it('renders unavailable weight when the stats action fails', async () => {
        vi.mocked(getSalesOrderStats).mockResolvedValueOnce({ success: false, error: 'unavailable', code: 'INTERNAL_ERROR' });
        const html = renderToStaticMarkup(await SalesPage({ searchParams: Promise.resolve({}) }));
        expect(html).toContain('Data berat belum tersedia');
        expect(html).not.toContain('0 kg');
    });

    it('passes one deterministic Jakarta snapshot to date-sensitive clients', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-31T18:00:00.000Z'));

        const page = await SalesPage({ searchParams: Promise.resolve({}) });
        renderToStaticMarkup(page);

        const periodProps = captures.period.mock.calls[0][0] as {
            start: Date;
            end: Date;
        };
        expect(periodProps.start.toISOString()).toBe(
            '2026-08-31T17:00:00.000Z',
        );
        expect(periodProps.end.toISOString()).toBe(
            '2026-09-30T16:59:59.999Z',
        );
        expect(captures.dateFilter).toHaveBeenCalledWith(
            expect.objectContaining({ presetTimeZone: 'Asia/Jakarta' }),
        );
        expect(captures.table).toHaveBeenCalledWith(
            expect.objectContaining({ businessToday: '2026-09-01' }),
        );
    });
});
