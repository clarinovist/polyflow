// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SalesLoading from '../field/sales/loading';
import SalesError from '../field/sales/error';
import MarketingLoading from '../field/marketing/loading';
import MarketingError from '../field/marketing/error';
import WarehouseLoading from '../warehouse/mobile/loading';
import WarehouseError from '../warehouse/mobile/error';
import ProductionLoading from '../production/mobile/loading';
import ProductionError from '../production/mobile/error';
import PurchasingLoading from '../purchasing/mobile/loading';
import PurchasingError from '../purchasing/mobile/error';
import FinanceLoading from '../finance/mobile/loading';
import FinanceError from '../finance/mobile/error';
import HrdLoading from '../hrd/mobile/loading';
import HrdError from '../hrd/mobile/error';
import { MobileDataFreshness } from '@/components/mobile';

const routes = [
    ['sales', SalesLoading, SalesError],
    ['marketing', MarketingLoading, MarketingError],
    ['warehouse', WarehouseLoading, WarehouseError],
    ['production', ProductionLoading, ProductionError],
    ['purchasing', PurchasingLoading, PurchasingError],
    ['finance', FinanceLoading, FinanceError],
    ['HRD', HrdLoading, HrdError],
] as const;

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('mobile route loading and uncaught error states', () => {
    it.each(routes)('%s exposes an announced loading state', (_name, Loading) => {
        render(<Loading />);
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('status').textContent).toMatch(/Memuat/);
    });

    it.each(routes)('%s hides raw errors and retries its route segment', (_name, _Loading, ErrorBoundary) => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const retry = vi.fn();
        render(
            <ErrorBoundary
                error={new Error('synthetic-sensitive-server-detail')}
                retry={retry}
            />,
        );

        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.queryByText(/synthetic-sensitive-server-detail/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
        expect(retry).toHaveBeenCalledOnce();
    });
});

describe('mobile snapshot freshness', () => {
    it('distinguishes a stale snapshot from offline connectivity', () => {
        render(
            <MobileDataFreshness
                generatedAt="2026-10-07T00:00:00.000Z"
                staleAfterMinutes={15}
                now={new Date('2026-10-07T01:00:00.000Z')}
            />,
        );
        const status = screen.getByRole('status');
        expect(status.textContent).toContain('Terakhir diperbarui');
        expect(status.textContent).toContain('Data mungkin sudah lama');
        expect(status.textContent).not.toContain('Tidak ada koneksi internet');
    });

    it('does not label a recent snapshot as stale', () => {
        render(
            <MobileDataFreshness
                generatedAt="2026-10-07T00:55:00.000Z"
                now={new Date('2026-10-07T01:00:00.000Z')}
            />,
        );
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByText(/Terakhir diperbarui/)).toBeTruthy();
    });
});
