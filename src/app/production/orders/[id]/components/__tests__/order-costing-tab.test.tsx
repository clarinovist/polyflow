// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderCostingTab, type OrderCostingData } from '../order-costing-tab';
import type { ExtendedProductionOrder } from '@/components/production/order-detail/types';
vi.mock('@/components/maklon/MaklonCostManager', () => ({
    MaklonCostManager: () => <div>Biaya maklon</div>,
}));
const order = {
    id: 'test',
    isMaklon: false,
    bom: { productVariant: { primaryUnit: 'KG' } },
} as ExtendedProductionOrder;
const costs = (
    materialCost: number,
    conversionCost: number,
): OrderCostingData =>
    ({
        materialCost,
        conversionCost,
        totalCost: materialCost + conversionCost,
        unitCost: (materialCost + conversionCost) / 200,
    }) as OrderCostingData;
describe('order costing presentation', () => {
    it('keeps WAC visible and explains valuation without hiding actual amounts', async () => {
        vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
        render(<OrderCostingTab order={order} costingData={costs(800000, 200000)} loadingCosting={false} />);
        expect(screen.getByText('Metode biaya: WAC')).toBeTruthy();
        expect(screen.getByText('80.0%')).toBeTruthy();
        expect(screen.queryByText(/Weighted Average Cost/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Info metode biaya WAC' }));
        expect((await screen.findByRole('tooltip')).textContent).toContain('Weighted Average Cost saat pengeluaran');
    });
    it('renders zero-cost composition without NaN or Infinity', () => {
        const { container } = render(
            <OrderCostingTab
                order={order}
                costingData={costs(0, 0)}
                loadingCosting={false}
            />,
        );
        expect(container.textContent).not.toMatch(/NaN|Infinity/);
        expect(screen.getAllByText('0.0%')).toHaveLength(2);
    });
    it('preserves cost ratios and shows maklon manager only for maklon', () => {
        const { rerender } = render(
            <OrderCostingTab
                order={order}
                costingData={costs(800000, 200000)}
                loadingCosting={false}
            />,
        );
        expect(screen.getByText('80.0%')).toBeTruthy();
        expect(screen.getByText('20.0%')).toBeTruthy();
        expect(screen.queryByText('Biaya maklon')).toBeNull();
        rerender(
            <OrderCostingTab
                order={{ ...order, isMaklon: true }}
                costingData={null}
                loadingCosting={false}
            />,
        );
        expect(screen.getByText('Biaya maklon')).toBeTruthy();
        expect(
            screen.getByText('Belum ada data biaya untuk SPK ini.'),
        ).toBeTruthy();
    });
    it('distinguishes loading from empty costs', () => {
        render(
            <OrderCostingTab order={order} costingData={null} loadingCosting />,
        );
        expect(screen.getByText('Menghitung biaya batch…')).toBeTruthy();
        expect(
            screen.queryByText('Belum ada data biaya untuk SPK ini.'),
        ).toBeNull();
    });
});
