// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesPerformanceReportClient } from '../reports/SalesPerformanceReportClient';

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const data = {
    rows: [], summary: {
        totalRevenue: 100, totalOrders: 1, totalCustomers: 1, avgOrderValue: 100,
        topCustomers: [], topProducts: [], bySalesperson: [], productMixByRegion: [],
    },
};
describe('Sales performance tab help', () => {
    it('keeps period and basis concise while ranking and region explanations remain accessible', async () => {
        render(<SalesPerformanceReportClient initialData={data} periodLabel="September 2026" start={new Date('2026-09-01')} end={new Date('2026-09-30')} />);
        expect(screen.getByText('Periode: September 2026 · Nilai Sales Order')).toBeTruthy();
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Performa per Sales' }), { button: 0, ctrlKey: false });
        const ranking = await screen.findByRole('button', { name: 'Info basis ranking sales' });
        expect(screen.queryByText(/berbeda dengan basis jurnal/)).toBeNull();
        fireEvent.click(ranking);
        expect((await screen.findByRole('tooltip')).textContent).toContain('jurnal akuntansi (4xx)');
        fireEvent.keyDown(ranking, { key: 'Escape' });
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Product Mix per Wilayah' }), { button: 0, ctrlKey: false });
        fireEvent.click(await screen.findByRole('button', { name: 'Info pengelompokan wilayah' }));
        expect((await screen.findByRole('tooltip')).textContent).toContain('Jika kota kosong');
    });
});
