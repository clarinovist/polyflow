// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductionOverviewClient, emptyOverviewData } from '../ProductionOverviewClient';

vi.mock('swr', () => ({
    default: (_key: string, _fetcher: unknown, options: { fallbackData: unknown }) => ({
        data: options.fallbackData,
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
    }),
}));

vi.mock('@/actions/dashboard/production-live-overview', () => ({
    getProductionLiveOverview: vi.fn(),
}));

vi.mock('../ProcessPulseChart', () => ({
    ProcessPulseChart: () => <div>Grafik produksi</div>,
}));

vi.mock('../LiveClockBar', () => ({
    LiveClockBar: () => <div>Jam langsung</div>,
}));

describe('ProductionOverviewClient', () => {
    it('keeps frequent actions and removes redundant navigation shortcuts', () => {
        render(<ProductionOverviewClient initialData={emptyOverviewData()} />);

        expect(
            screen
                .getByRole('link', { name: '+ SPK baru' })
                .getAttribute('href'),
        ).toBe('/production/orders/create');
        expect(screen.queryByRole('link', { name: 'Papan FG' })).not.toBeTruthy();
        expect(screen.queryByRole('link', { name: 'Bahan Gudang' })).not.toBeTruthy();
    });
});
