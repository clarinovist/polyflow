// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Product360Tabs } from '../Product360Tabs';

const mocks = vi.hoisted(() => ({ query: '' }));

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(mocks.query),
    useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('@/components/warehouse/StockLedgerClient', () => ({
    StockLedgerClient: () => <div>ledger-stub</div>,
}));
vi.mock('../ProductStockByLocationTab', () => ({
    ProductStockByLocationTab: ({ showPrices }: { showPrices?: boolean }) => (
        <div>{`stock-tab showPrices=${String(showPrices)}`}</div>
    ),
}));
vi.mock('../ProductBatchesTab', () => ({ ProductBatchesTab: () => null }));
vi.mock('../ProductBomTab', () => ({ ProductBomTab: () => null }));
vi.mock('../ProductCostHistoryTab', () => ({
    ProductCostHistoryTab: () => <div>cost-history-stub</div>,
}));
vi.mock('../ProductReservationsTab', () => ({
    ProductReservationsTab: () => null,
}));
vi.mock('../ProductMovementsTab', () => ({ ProductMovementsTab: () => null }));

const overview = {
    variant: {
        id: 'v-1',
        name: 'Varian Uji',
        skuCode: 'SKU-1',
        primaryUnit: 'KG',
        costingMethod: 'WEIGHTED_AVERAGE',
        standardCost: 750,
    },
    totalQty: 10,
    totalValue: 5000,
};

function renderTabs(props: { showPrices?: boolean; initialTab?: string } = {}) {
    return render(
        <Product360Tabs
            productVariantId="v-1"
            ledgerData={
                {} as React.ComponentProps<
                    typeof Product360Tabs
                >['ledgerData']
            }
            locations={[]}
            overview={overview}
            initialTab={props.initialTab ?? 'overview'}
            showPrices={props.showPrices}
        />,
    );
}

beforeEach(() => {
    mocks.query = '';
});
afterEach(cleanup);

describe('Product360Tabs: valuation visibility', () => {
    it('shows value, standard cost and the Biaya tab by default', () => {
        renderTabs();

        expect(screen.getAllByText(/Value/).length).toBeGreaterThan(0);
        expect(screen.getByText('Standard Cost')).toBeTruthy();
        expect(screen.getByText('Total Value')).toBeTruthy();
        expect(screen.getByRole('tab', { name: /Biaya/ })).toBeTruthy();
    });

    it('hides value, standard cost and the Biaya tab when showPrices is false', () => {
        renderTabs({ showPrices: false });

        expect(screen.queryByText(/Value/)).toBeNull();
        expect(screen.queryByText('Standard Cost')).toBeNull();
        expect(screen.queryByText('Total Value')).toBeNull();
        expect(screen.queryByRole('tab', { name: /Biaya/ })).toBeNull();
        expect(screen.getByText('Total Qty Semua Lokasi')).toBeTruthy();
    });

    it('falls back to the overview when the cost tab is requested without prices', () => {
        mocks.query = 'tab=cost';

        renderTabs({ showPrices: false });

        expect(screen.queryByText('cost-history-stub')).toBeNull();
        expect(screen.getByText('Overview Produk')).toBeTruthy();
    });

    it('passes showPrices through to the stock-by-location tab', () => {
        mocks.query = 'tab=stock';

        renderTabs({ showPrices: false });

        expect(screen.getByText('stock-tab showPrices=false')).toBeTruthy();
    });
});
