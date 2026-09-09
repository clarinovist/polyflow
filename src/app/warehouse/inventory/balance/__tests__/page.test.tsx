// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getReport } = vi.hoisted(() => ({ getReport: vi.fn() }));
vi.mock('@/actions/inventory/stock-balance', () => ({ getStockBalanceAction: getReport }));
vi.mock('@/components/warehouse/inventory/StockBalanceReport', () => ({
    StockBalanceReport: ({ data }: { data: { startDate: string } }) => <div>report:{data.startDate}</div>,
}));
import StockBalancePage from '../page';

beforeEach(() => {
    vi.resetAllMocks();
    getReport.mockResolvedValue({ success: true, data: { startDate: '2026-09-01' } });
});
afterEach(cleanup);

describe('StockBalancePage', () => {
    it('passes absent filters to the service defaults and renders report', async () => {
        render(await StockBalancePage({ searchParams: Promise.resolve({}) }));
        expect(getReport).toHaveBeenCalledWith({ startDate: undefined, endDate: undefined, locationId: undefined });
        expect(screen.getByRole('heading', { name: 'Neraca Stok' })).toBeTruthy();
        expect(screen.getByText('report:2026-09-01')).toBeTruthy();
    });

    it('normalizes repeated URL keys and passes strings unchanged', async () => {
        await StockBalancePage({ searchParams: Promise.resolve({
            startDate: ['2026-08-01', '2026-09-01'], endDate: '2026-08-31', locationId: ['L1', 'L2'],
        }) });
        expect(getReport).toHaveBeenCalledWith({ startDate: '2026-08-01', endDate: '2026-08-31', locationId: 'L1' });
    });

    it('renders failures with recovery instead of an empty balance', async () => {
        getReport.mockResolvedValue({ success: false, error: 'Tanggal tidak valid' });
        render(await StockBalancePage({ searchParams: Promise.resolve({ startDate: 'bad' }) }));
        expect(screen.getByRole('alert').textContent).toContain('Tanggal tidak valid');
        expect(screen.queryByText(/report:/)).toBeNull();
        expect(screen.getByRole('link', { name: 'Reset filter dan coba lagi' }).getAttribute('href')).toBe('/warehouse/inventory/balance');
        expect(screen.getByRole('link', { name: 'Kembali ke Inventaris' }).getAttribute('href')).toBe('/warehouse/inventory');
    });
});
