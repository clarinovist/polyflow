// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductStockByLocationTab } from '../ProductStockByLocationTab';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('@/actions/inventory/product-360', () => ({
    listStockByLocation: mocks.list,
}));

const rows = [
    {
        id: 'i-1',
        quantity: 10,
        averageCost: 500,
        location: { id: 'l-1', name: 'Gudang Utama', slug: 'gudang-utama' },
    },
];

beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ success: true, data: rows });
});
afterEach(cleanup);

describe('ProductStockByLocationTab: valuation visibility', () => {
    it('shows average cost and value columns by default', async () => {
        render(<ProductStockByLocationTab productVariantId="v-1" />);

        await waitFor(() => expect(screen.getByText('Gudang Utama')).toBeTruthy());
        expect(screen.getByText('Biaya Rata-rata')).toBeTruthy();
        expect(screen.getByText('Nilai')).toBeTruthy();
        expect(screen.getByText(/value/)).toBeTruthy();
    });

    it('shows quantities only when showPrices is false', async () => {
        render(
            <ProductStockByLocationTab
                productVariantId="v-1"
                showPrices={false}
            />,
        );

        await waitFor(() => expect(screen.getByText('Gudang Utama')).toBeTruthy());
        expect(screen.getByText('Jumlah')).toBeTruthy();
        expect(screen.queryByText('Biaya Rata-rata')).toBeNull();
        expect(screen.queryByText('Nilai')).toBeNull();
        expect(screen.queryByText(/value/)).toBeNull();
        expect(screen.queryByText(/Rp/)).toBeNull();
    });
});
