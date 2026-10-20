// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeliverySummaryGrid } from '../delivery-detail/DeliverySummaryGrid';
import { DeliveryFleetCard } from '../delivery-detail/DeliveryFleetCard';
import type { DeliveryOrderDetailData } from '../delivery-detail/types';
vi.mock('../EditDeliveryPricingDialog', () => ({ EditDeliveryPricingDialog: () => <button>Periksa tarif</button> }));
afterEach(cleanup);
const order: DeliveryOrderDetailData = {
    id: 'do', salesOrderId: 'so', orderNumber: 'SJ-fixture', status: 'LOADING', deliveryDate: '2026-10-20',
    estimatedWeightKg: 100, appliedRateType: 'PER_KG', totalCharge: 1000,
    items: [{ id: 'item', quantity: 90, enteredUnit: 'BAL', enteredQuantity: 9, conversionFactorSnapshot: 10, productVariant: { primaryUnit: 'KG' } }],
};
describe('delivery load vs pricing weight', () => {
    it('uses current item weight after reload without overwriting manual tariff basis or totals', () => {
        render(<><DeliverySummaryGrid order={order} isLoadVerified={false} /><DeliveryFleetCard order={order} warehouseMode={false} /></>);
        expect(screen.getByText('1 varian · 90 kg')).toBeTruthy();
        expect(screen.getByText('Berat dasar tarif tersimpan')).toBeTruthy();
        expect(screen.getByRole('status').textContent).toMatch(/90.*100/);
        expect(order.estimatedWeightKg).toBe(100);
        expect(order.totalCharge).toBe(1000);
    });
    it('does not invent kg for mixed units with unknown conversion', () => {
        render(<DeliverySummaryGrid order={{ ...order, items: [...order.items, { id: 'unknown', quantity: 5, productVariant: { primaryUnit: 'PCS' } }] }} isLoadVerified={false} />);
        expect(screen.queryByText(/2 varian.*kg/)).toBeNull();
        expect(screen.getByText(/Berat muatan belum dapat dihitung/)).toBeTruthy();
    });
});
