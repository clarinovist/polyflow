// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getReturns: vi.fn() }));
vi.mock('@/actions/sales/sales-returns', () => ({ getSalesReturns: mocks.getReturns }));
vi.mock('@/components/common/url-transaction-date-filter', () => ({ UrlTransactionDateFilter: () => <button>Date filter</button> }));
import SalesReturnsPage from '../page';

describe('Sales returns list states', () => {
    beforeEach(() => mocks.getReturns.mockResolvedValue({ success: true, data: [] }));
    it('shows a failed query as an error, not empty returns and zero totals', async () => {
        mocks.getReturns.mockResolvedValue({ success: false, error: 'Unable to load synthetic returns' });
        render(await SalesReturnsPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole('alert').textContent).toContain('Unable to load synthetic returns');
        expect(screen.queryByText('Semua Retur')).toBeNull();
        expect(screen.queryByText('Nilai Retur Periode')).toBeNull();
        expect(screen.queryByText(/Belum ada retur penjualan/)).toBeNull();
    });
    it('keeps the empty state and portal create link on a successful empty query', async () => {
        render(await SalesReturnsPage({ searchParams: Promise.resolve({}) }));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getAllByText(/Belum ada retur penjualan/)).toHaveLength(2);
        expect(screen.getByRole('link', { name: /Retur Baru/ }).getAttribute('href')).toBe('/sales/returns/create');
    });
    it('passes search, status and date filters through unchanged', async () => {
        await SalesReturnsPage({ searchParams: Promise.resolve({ search: 'SR-TEST', status: 'DRAFT', startDate: '2026-09-01', endDate: '2026-09-30' }) });
        expect(mocks.getReturns).toHaveBeenCalledWith({ search: 'SR-TEST', status: 'DRAFT', startDate: expect.any(Date), endDate: expect.any(Date) });
    });
    it('allows the mobile heading and filter/action controls to wrap', async () => {
        render(await SalesReturnsPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole('heading', { level: 1 }).parentElement?.parentElement?.className).toContain('flex-col');
        expect(screen.getByRole('button', { name: 'Date filter' }).parentElement?.className).toContain('flex-wrap');
    });
});
