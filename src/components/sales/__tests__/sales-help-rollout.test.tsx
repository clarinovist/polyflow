// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SalesDeliveriesPage from '@/app/sales/deliveries/page';
import SalesPerformanceReportPage from '@/app/sales/reports/sales-performance/page';
import SalesMarginReportPage from '@/app/sales/reports/margin/page';
import CommissionReportPage from '@/app/sales/reports/commission/page';
import { SalesInvoicesShell } from '../SalesInvoicesShell';

const mocks = vi.hoisted(() => ({
    deliveries: vi.fn(), performance: vi.fn(), margin: vi.fn(),
    performanceClient: vi.fn(), marginClient: vi.fn(), commissionClient: vi.fn(),
    invoiceTable: vi.fn(),
    session: { data: { user: { role: 'SALES' } } },
}));
vi.mock('@/actions/inventory/deliveries', () => ({ getDeliveryOrders: mocks.deliveries }));
vi.mock('@/actions/sales/sales-reports', () => ({ getSalesPerformanceReport: mocks.performance }));
vi.mock('@/actions/sales/margin-report', () => ({ getSalesMarginReport: mocks.margin }));
vi.mock('@/components/sales/DeliveryOrderTable', () => ({ DeliveryOrderTable: () => <div>Delivery table</div> }));
vi.mock('@/components/sales/CreateDeliveryOrderDialog', () => ({ CreateDeliveryOrderDialog: () => <button>Buat Surat Jalan</button> }));
vi.mock('@/components/common/url-transaction-date-filter', () => ({ UrlTransactionDateFilter: () => <button>Filter tanggal</button> }));
vi.mock('@/components/support/contextual-help', () => ({ ContextualHelp: () => <button>Panduan laporan</button> }));
vi.mock('@/components/sales/reports/SalesPerformanceReportClient', () => ({ SalesPerformanceReportClient: (props: unknown) => { mocks.performanceClient(props); return <div>Performance report</div>; } }));
vi.mock('@/app/sales/reports/margin/MarginReportClient', () => ({ MarginReportClient: (props: unknown) => { mocks.marginClient(props); return <div>Margin report</div>; } }));
vi.mock('@/app/sales/reports/commission/CommissionReportClient', () => ({ CommissionReportClient: (props: unknown) => { mocks.commissionClient(props); return <div>Commission results</div>; } }));
vi.mock('@/components/sales/InvoiceTable', () => ({ InvoiceTable: (props: unknown) => { mocks.invoiceTable(props); return <div>Invoice table</div>; } }));
vi.mock('next-auth/react', () => ({ useSession: () => mocks.session }));

const dates = { startDate: '2026-09-01T00:00:00.000Z', endDate: '2026-09-30T23:59:59.999Z' };
const params = () => Promise.resolve(dates);
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    mocks.deliveries.mockResolvedValue({ success: true, data: [] });
    mocks.performance.mockResolvedValue({ success: true, data: { rows: [], summary: {} } });
    mocks.margin.mockResolvedValue({ success: true, data: { summary: { ordersWithIncompleteHpp: 2 } } });
    mocks.session.data.user.role = 'SALES';
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function openInfo(name: string) {
    fireEvent.click(screen.getByRole('button', { name }));
    return (await screen.findByRole('tooltip')).textContent;
}

describe('compact Sales help rollout', () => {
    it('keeps the warehouse link visible and explains draft stock/date behavior only on request', async () => {
        render(await SalesDeliveriesPage({ searchParams: params() }));
        expect(screen.getByRole('link', { name: 'Buka Portal Gudang →' }).getAttribute('href')).toBe('/warehouse/outgoing');
        expect(screen.getByRole('button', { name: 'Buat Surat Jalan' })).toBeTruthy();
        expect(screen.queryByText(/stok belum dipotong/)).toBeNull();
        const text = await openInfo('Info Surat Jalan');
        expect(text).toContain('PENDING / LOADING');
        expect(text).toContain('stok belum dipotong');
        expect(text).toContain('tidak hilang meski di luar filter bulan');
        expect(mocks.deliveries).toHaveBeenCalledWith({ startDate: new Date(dates.startDate), endDate: new Date(dates.endDate) });
    });

    it('keeps report period visible and retains the SO revenue definition in help', async () => {
        render(await SalesPerformanceReportPage({ searchParams: params() }));
        expect(screen.getByText(/Periode: /)).toBeTruthy();
        expect(screen.queryByText(/bukan invoice/)).toBeNull();
        expect(await openInfo('Info omzet laporan penjualan')).toContain('SO non-batal');
        expect(screen.getByRole('tooltip').textContent).toContain('orderDate');
        expect(mocks.performanceClient).toHaveBeenCalledWith(expect.objectContaining({
            start: new Date(dates.startDate), end: new Date(dates.endDate),
        }));
    });

    it('moves HPP method into info without changing incomplete-HPP data passed to the report', async () => {
        render(await SalesMarginReportPage({ searchParams: params() }));
        expect(screen.queryByText(/rata-rata tertimbang/)).toBeNull();
        const text = await openInfo('Info perhitungan HPP dan margin');
        expect(text).toContain('rata-rata tertimbang');
        expect(text).toContain('bukan margin 0% atau 100%');
        expect(mocks.marginClient).toHaveBeenCalledWith(expect.objectContaining({
            data: { summary: { ordersWithIncompleteHpp: 2 } },
        }));
    });

    it('keeps an actual margin loading failure visible outside help', async () => {
        mocks.margin.mockResolvedValueOnce({ success: false, error: 'unavailable' });
        render(await SalesMarginReportPage({ searchParams: params() }));
        expect(screen.getByText(/Gagal memuat laporan margin/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Info perhitungan HPP dan margin' })).toBeNull();
    });

    it('puts full commission instructions in a closed native disclosure and preserves report dates', async () => {
        const page = await CommissionReportPage({ searchParams: Promise.resolve({ from: '2026-09-01', to: '2026-09-30' }) });
        const html = renderToStaticMarkup(page);
        expect(html).not.toContain('boundary exact inclusive');
        const { container } = render(page);
        const details = container.querySelector('details')!;
        expect(details.open).toBe(false);
        expect(details.querySelector('summary')?.textContent).toBe('Cara perhitungan');
        expect(details.textContent).toContain('NO_TARGET_SET');
        expect(details.textContent).toContain('nilainya kosong, bukan nol');
        expect(details.textContent).toContain('Nilai tepat pada batas');
        expect(await openInfo('Info basis komisi')).toContain('PAID_INVOICE');
        expect(mocks.commissionClient).toHaveBeenCalledWith({ initialFrom: '2026-09-01', initialTo: '2026-09-30' });
    });

    it('keeps all-time receivables explicit and invoice filtering unchanged', async () => {
        const invoices = [
            { id: 'paid', status: 'PAID', totalAmount: 100, paidAmount: 100 },
            { id: 'unpaid', status: 'UNPAID', totalAmount: 200, paidAmount: 0 },
        ];
        render(<SalesInvoicesShell initialInvoices={invoices} stats={{ totalOutstanding: 200, overdueCount: 0, partialCount: 0, paidCount: 1, unpaidCount: 1 }} periodLabel="September 2026" />);
        expect(screen.getByText('Seluruh periode')).toBeTruthy();
        expect(screen.getByText('Piutang Belum Lunas')).toBeTruthy();
        expect(screen.queryByText(/invoiceDate/)).toBeNull();
        expect(await openInfo('Info periode daftar invoice')).toContain('invoiceDate');
        fireEvent.keyDown(screen.getByRole('button', { name: 'Info periode daftar invoice' }), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
        expect(await openInfo('Info piutang seluruh periode')).toContain('bukan hanya invoice dalam filter tanggal daftar');
        fireEvent.click(screen.getByRole('button', { name: /^Lunas/ }));
        expect(mocks.invoiceTable).toHaveBeenLastCalledWith(expect.objectContaining({ invoices: [expect.objectContaining({ id: 'paid' })] }));
        expect(screen.queryByRole('link', { name: /Lihat Aging/ })).toBeNull();
    });

    it('retains the authorized finance navigation link outside help', () => {
        mocks.session.data.user.role = 'ADMIN';
        render(<SalesInvoicesShell initialInvoices={[]} stats={null} periodLabel="September 2026" />);
        expect(screen.getByRole('link', { name: /Lihat Aging/ }).getAttribute('href')).toBe('/finance/aging');
    });
});
