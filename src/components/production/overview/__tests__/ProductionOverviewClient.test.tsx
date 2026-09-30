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
    data.todayOutputItems = [
        { productVariantId: 'product-a', productName: 'Produk Rafia', skuCode: 'RF-01', processKey: 'MIXING', quantity: 120, unit: 'KG', orderCount: 2 },
        { productVariantId: 'product-b', productName: 'Produk Packing', skuCode: 'PK-01', processKey: 'PACKING', quantity: 25, unit: 'PACK', orderCount: 1 },
    ];
    data.runningOrders = Array.from({ length: 8 }, (_, index) => ({ id: `order-${index}`, orderNumber: `TEST-${index}`, productName: `Test product ${index}`, machineCode: 'TEST', operatorName: 'Test operator', plannedQty: 100, actualQty: 25, progress: 25, isLate: false, processKey: index % 2 ? 'MIXING' : 'EXTRUSION', startedAt: new Date(), estimatedDoneAt: null }));
    data.attentions = [{ type: 'test', severity: 'red', title: 'Mixing attention', subtitle: 'Test issue', ageMinutes: 10, processKey: 'MIXING', orderId: 'order-1' }];
    return data;
}

describe('ProductionOverviewClient', () => {
    it('puts itemized daily output first and removes the unused condition strip', () => {
        render(<ProductionOverviewClient initialData={fixture()} />);
        expect(screen.queryByText('Kondisi seluruh proses')).toBeNull();
        expect(screen.queryByRole('link', { name: 'Buat SPK' })).toBeNull();
        expect(screen.queryByText('Grafik produksi')).toBeNull();
        expect(screen.queryByText('Hari Ini — Produksi')).toBeNull();
        expect(screen.getByText('Produk Rafia')).toBeTruthy();
        expect(screen.getByText('Produk Packing')).toBeTruthy();
        expect(screen.getByText(/PK-01 · Packing · 1 SPK/)).toBeTruthy();
        expect(screen.getAllByText('PCS').length).toBeGreaterThan(0);
        const summary = screen.getByRole('region', { name: 'Ringkasan hasil hari ini' });
        const work = screen.getByText('Test product 0');
        expect(summary.compareDocumentPosition(work) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        const itemLink = screen.getByRole('link', { name: /Produk Rafia/ });
        const itemParams = new URL(itemLink.getAttribute('href')!, 'http://localhost').searchParams;
        expect(itemParams.get('preset')).toBe('today');
        expect(itemParams.get('productVariantId')).toBe('product-a');
        expect(itemParams.get('process')).toBe('MIXING');
        expect(screen.getByRole('link', { name: /Lihat rekap lengkap/ }).getAttribute('href')).toContain('preset=today');
    });
    it('filters only work and attention while the daily result stays global', () => {
        render(<ProductionOverviewClient initialData={fixture()} />);
        expect(screen.getByRole('button', { name: 'SEMUA' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'EXTRUSION' }));
        expect(screen.queryByText('Test product 1')).toBeNull();
        expect(screen.queryByText('Mixing attention')).toBeNull();
        expect(screen.getByRole('region', { name: 'Ringkasan hasil hari ini' }).textContent).toContain('120');
        fireEvent.click(screen.getByRole('button', { name: 'SEMUA' }));
        expect(screen.getByText('Mixing attention')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'SEMUA' }).getAttribute('aria-pressed')).toBe('true');
    });
});
