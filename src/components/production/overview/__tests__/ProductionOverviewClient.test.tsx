// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductionOverviewClient, emptyOverviewData } from '../ProductionOverviewClient';

vi.mock('swr', () => ({ default: (_key: string, _fetcher: unknown, options: { fallbackData: unknown }) => ({ data: options.fallbackData, error: undefined, isLoading: false, mutate: vi.fn() }) }));
vi.mock('@/actions/dashboard/production-live-overview', () => ({ getProductionLiveOverview: vi.fn() }));
vi.mock('../ProcessPulseChart', () => ({ ProcessPulseChart: () => <div>Grafik produksi</div> }));
vi.mock('../LiveClockBar', () => ({ LiveClockBar: () => <div>Data freshness</div> }));
afterEach(cleanup);

function fixture() {
    const data = emptyOverviewData();
    data.totals.activeJobs = 8;
    data.processes.MIXING.outputToday = 120;
    data.runningOrders = Array.from({ length: 8 }, (_, index) => ({ id: `order-${index}`, orderNumber: `TEST-${index}`, productName: `Test product ${index}`, machineCode: 'TEST', operatorName: 'Test operator', plannedQty: 100, actualQty: 25, progress: 25, isLate: false, processKey: index % 2 ? 'MIXING' : 'EXTRUSION', startedAt: new Date(), estimatedDoneAt: null }));
    data.attentions = [{ type: 'test', severity: 'red', title: 'Mixing attention', subtitle: 'Test issue', ageMinutes: 10, processKey: 'MIXING', orderId: 'order-1' }];
    return data;
}

describe('ProductionOverviewClient', () => {
    it('prioritizes work before concise process results, without duplicated heading or charts', () => {
        render(<ProductionOverviewClient initialData={fixture()} />);
        expect(screen.getByRole('link', { name: 'Buat SPK' }).getAttribute('href')).toBe('/production/orders/create');
        expect(screen.queryByText('Grafik produksi')).toBeNull();
        expect(screen.queryByText('Hari Ini — Produksi')).toBeNull();
        expect(screen.getAllByText(/^Test product/)).toHaveLength(5);
        const work = screen.getByText('Test product 0');
        const summary = screen.getByRole('region', { name: 'Ringkasan hasil hari ini' });
        expect(work.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.getByRole('link', { name: /Tren & Analitik/ }).getAttribute('href')).toBe('/production/analytics');
    });
    it('filters only work/attention, starts at all, and global attention shortcut resets filter', () => {
        Element.prototype.scrollIntoView = vi.fn();
        render(<ProductionOverviewClient initialData={fixture()} />);
        expect(screen.getByRole('button', { name: 'SEMUA' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'EXTRUSION' }));
        expect(screen.queryByText('Test product 1')).toBeNull();
        expect(screen.queryByText('Mixing attention')).toBeNull();
        expect(screen.getByRole('link', { name: /8 SPK jalan/ })).toBeTruthy();
        expect(screen.getByRole('region', { name: 'Ringkasan hasil hari ini' }).textContent).toContain('120');
        fireEvent.click(screen.getByRole('button', { name: /Butuh perhatian/ }));
        expect(screen.getByText('Mixing attention')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'SEMUA' }).getAttribute('aria-pressed')).toBe('true');
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    });
});
