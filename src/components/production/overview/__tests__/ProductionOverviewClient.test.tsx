// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ProductionOverviewClient,
    emptyOverviewData,
    type ProductionOverviewData,
} from '../ProductionOverviewClient';

const swr = vi.hoisted(() => ({
    error: undefined as Error | undefined,
    mutate: vi.fn(),
}));
vi.mock('swr', () => ({
    default: (
        _key: string,
        _fetcher: unknown,
        options: { fallbackData: unknown },
    ) => ({
        data: options.fallbackData,
        error: swr.error,
        isLoading: false,
        mutate: swr.mutate,
    }),
}));
vi.mock('@/actions/dashboard/production-live-overview', () => ({
    getProductionLiveOverview: vi.fn(),
}));
afterEach(cleanup);

function fixture(): ProductionOverviewData {
    const data = emptyOverviewData();
    data.generatedAt = '2026-10-09T08:00:00.000Z';
    data.permissions!.links = {
        outputReport: '/production/output-report',
        daily: '/production/daily',
        orders: '/production/orders',
        warehouseMaterials: null,
        kiosk: null,
    };
    data.health!.output.items = [
        {
            productVariantId: 'product-a',
            productName: 'Produk dengan nama sangat panjang untuk wrapping aman',
            skuCode: 'RF-01-LONG',
            processKey: 'MIXING',
            quantity: 120,
            unit: 'KG',
            orderCount: 2,
        },
        {
            productVariantId: 'product-b',
            productName: 'Produk PCS',
            skuCode: 'PCS-01',
            processKey: 'MIXING',
            quantity: 25,
            unit: 'PCS',
            orderCount: 1,
        },
    ];
    data.health!.output.totalGroups = 2;
    data.health!.output.returned = 2;
    data.health!.output.processTotals = [
        { processKey: 'MIXING', quantity: 120, unit: 'KG' },
        { processKey: 'MIXING', quantity: 25, unit: 'PCS' },
    ];
    data.health!.activeSpk = { state: 'AVAILABLE', total: 18, lateTotal: 7 };
    data.health!.downtime = {
        state: 'AVAILABLE',
        total: 1,
        thresholdMinutes: 30,
        longest: {
            incidentId: 'down-1',
            machineId: 'machine-1',
            machineCode: 'MESIN-DENGAN-KODE-SANGAT-PANJANG',
            reason: 'Alasan downtime panjang tanpa menyembunyikan informasi penting',
            minutes: 3_721,
            severity: 'red',
        },
    };
    data.liveOrders = {
        state: 'AVAILABLE',
        total: 18,
        lateTotal: 7,
        returned: 1,
        items: [
            {
                id: 'order-1',
                orderNumber: 'SPK-001',
                productName: 'Produk Mixing',
                machineCode: 'M-1',
                operatorName: 'Operator',
                plannedQty: 100,
                actualQty: 25,
                progress: 25,
                isLate: true,
                processKey: 'MIXING',
                unit: 'KG',
                startedAt: '2026-10-09T07:00:00.000Z' as never,
                estimatedDoneAt: null,
            },
        ],
    };
    data.attention = {
        state: 'AVAILABLE',
        total: 27,
        returned: 1,
        items: [
            {
                type: 'waiting_material',
                severity: 'amber',
                title: 'Material attention',
                subtitle: 'Need material',
                ageMinutes: 10,
                processKey: 'MIXING',
                orderId: 'order-1',
                href: '/production/orders/order-1',
            },
        ],
    };
    data.drivers = {
        state: 'AVAILABLE',
        longestDowntime: {
            ...data.health!.downtime.longest!,
            href: undefined,
        },
        lateProcess: {
            processKey: 'MIXING',
            lateCount: 7,
            oldestDelayMinutes: 1_501,
        },
    };
    return data;
}

describe('ProductionOverviewClient R4C', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        swr.error = undefined;
    });

    it('orders Health → Attention → Drivers, preserves mixed units, totals, and bounded samples', () => {
        render(<ProductionOverviewClient initialData={fixture()} />);

        const text = document.body.textContent ?? '';
        expect(text.indexOf('Health')).toBeLessThan(text.indexOf('Attention'));
        expect(text.indexOf('Attention')).toBeLessThan(text.indexOf('Drivers'));
        expect(screen.getByText('18 SPK')).toBeTruthy();
        expect(screen.getByText('7 terlambat')).toBeTruthy();
        expect(screen.getByText('18 total · 1 ditampilkan')).toBeTruthy();
        expect(screen.getByText('27 total · 1 ditampilkan')).toBeTruthy();
        expect(screen.getAllByText(/120 KG/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/25 PCS/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/62 jam 1 menit/).length).toBe(2);
        expect(screen.getByText(/25 jam 1 menit/)).toBeTruthy();
        expect(screen.queryByText(/attainment/i)).toBeNull();
        expect(screen.queryByText(/scrap rate/i)).toBeNull();
        expect(screen.queryByText(/utilisasi/i)).toBeNull();
    });

    it('gives clickable Attention items a keyboard and touch-sized primary target', () => {
        render(<ProductionOverviewClient initialData={fixture()} />);

        const itemLink = screen.getByRole('link', {
            name: /Material attention.*Need material/,
        });
        expect(itemLink.className).toContain('min-h-11');
        expect(itemLink.className).toContain('items-center');
        expect(itemLink.getAttribute('href')).toBe(
            '/production/orders/order-1',
        );
    });

    it('keeps process filtering for live SPK and Attention only', () => {
        render(<ProductionOverviewClient initialData={fixture()} />);

        fireEvent.click(screen.getByRole('button', { name: 'EXTRUSION' }));
        expect(screen.queryByText('Produk Mixing')).toBeNull();
        expect(screen.queryByText('Material attention')).toBeNull();
        expect(
            screen.getByLabelText('Ringkasan hasil hari ini').textContent,
        ).toContain('120');
        fireEvent.click(screen.getByRole('button', { name: 'SEMUA' }));
        expect(screen.getByText('Produk Mixing')).toBeTruthy();
    });

    it('does not render links withheld by the fresh server permission payload', () => {
        const data = fixture();
        data.permissions!.links = {
            outputReport: null,
            daily: null,
            orders: null,
            warehouseMaterials: null,
            kiosk: null,
        };
        data.health!.downtime.longest!.href = undefined;
        data.attention!.items[0]!.href = undefined;

        render(<ProductionOverviewClient initialData={data} />);

        expect(screen.queryByRole('link', { name: /rekap lengkap/i })).toBeNull();
        expect(screen.queryByRole('link', { name: /Board Proses/i })).toBeNull();
        expect(screen.queryByRole('link', { name: /Detail/i })).toBeNull();
        expect(screen.queryByRole('link', { name: /Kiosk/i })).toBeNull();
        expect(screen.getByText('Material attention').closest('a')).toBeNull();
    });

    it('shows partial unavailable states without turning them into zero', () => {
        const data = fixture();
        data.health!.output = {
            state: 'UNAVAILABLE',
            totalGroups: 0,
            returned: 0,
            truncated: false,
            processTotals: [],
            items: [],
        };
        data.attention!.state = 'UNAVAILABLE';
        data.attention!.total = null;
        data.drivers!.state = 'UNAVAILABLE';

        render(<ProductionOverviewClient initialData={data} />);

        expect(screen.getByText('Sebagian Attention Production tidak tersedia')).toBeTruthy();
        expect(screen.getByText('Sebagian Drivers Production tidak tersedia')).toBeTruthy();
        expect(screen.getAllByText('Data tidak tersedia').length).toBeGreaterThan(0);
        expect(screen.getByText('Material attention')).toBeTruthy();
        expect(screen.queryByLabelText('Ringkasan hasil hari ini')).toBeNull();
    });

    it('surfaces stale refresh failure, retains last-good data, and uses the same mutate path manually', async () => {
        swr.error = new Error('network failed');
        swr.mutate.mockResolvedValue(undefined);

        render(<ProductionOverviewClient initialData={fixture()} />);

        expect(
            screen.getByText('Pembaruan gagal · data terakhir tetap ditampilkan'),
        ).toBeTruthy();
        expect(screen.getByText('18 SPK')).toBeTruthy();
        expect(screen.getAllByText(/Snapshot server/).length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', { name: /Segarkan/ }));
        await waitFor(() => expect(swr.mutate).toHaveBeenCalledOnce());
    });
});
