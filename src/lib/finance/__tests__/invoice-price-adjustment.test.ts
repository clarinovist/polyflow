import { describe, expect, it } from 'vitest';
import { calculatePriceAdjustment } from '../invoice-price-adjustment';
import { getSalesInvoiceBalance, getSalesInvoiceSettlementStatus } from '../sales-return-allocation';
describe('price changes never rewrite original invoice or cash', () => {
    it('computes signed net and original VAT delta for partial quantity', () => {
        expect(calculatePriceAdjustment({ sourceQuantity: '10', sourceNet: '1000', sourceTax: '110', quantity: '2', newNetUnitPrice: '90' })).toEqual({ netAmount: '-20.00', taxAmount: '-2.20', totalAmount: '-22.20', oldNetUnitPrice: '100.000000' });
        expect(calculatePriceAdjustment({ sourceQuantity: '10', sourceNet: '1000', sourceTax: '110', quantity: '2', newNetUnitPrice: '120' }).totalAmount).toBe('44.40');
    });
    it.each([{ quantity: '11' }, { quantity: '0' }, { newNetUnitPrice: '-1' }, { newNetUnitPrice: 'NaN' }, { newNetUnitPrice: '100' }])('rejects invalid/no-change values %j', patch => {
        expect(() => calculatePriceAdjustment({ sourceQuantity: '10', sourceNet: '1000', sourceTax: '110', quantity: '2', newNetUnitPrice: '90', ...patch })).toThrow();
    });
    it('includes signed price adjustment in net balance and settled status', () => {
        const invoice = { totalAmount: '1000', paidAmount: '300', creditedAmount: '100', priceAdjustmentAmount: '-200' };
        expect(getSalesInvoiceBalance(invoice).toString()).toBe('400');
        expect(getSalesInvoiceSettlementStatus({ ...invoice, paidAmount: '700' })).toBe('PAID');
        expect(getSalesInvoiceBalance({ ...invoice, priceAdjustmentAmount: '200' }).toString()).toBe('800');
    });
});
