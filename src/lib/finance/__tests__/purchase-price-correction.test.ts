import { describe, expect, it } from 'vitest';
import { allocatePurchasePriceCorrection, purchasePriceCorrectionInput } from '../purchase-price-correction';

const row = (stockQuantity: string, receiptDelta = '200', locationId = 'location-a') => ({
    locationId, receivedQuantity: '10', receiptDelta, stockQuantity, averageCost: '100',
});

describe('purchase price allocation', () => {
    it.each([
        ['10', '200', '200.00', '0.00', '120.0000'],
        ['4', '200', '80.00', '120.00', '120.0000'],
        ['0', '200', '0.00', '200.00', '100.0000'],
        ['20', '200', '200.00', '0.00', '110.0000'],
        ['4', '-200', '-80.00', '-120.00', '80.0000'],
        ['0', '-200', '0.00', '-200.00', '100.0000'],
    ])('allocates stock %s delta %s', (stock, delta, inventory, variance, average) => {
        const result = allocatePurchasePriceCorrection([row(stock, delta)]);
        expect(result).toMatchObject({ receiptAmount: Number(delta).toFixed(2), inventoryAmount: inventory, varianceAmount: variance });
        expect(result.locations[0].newAverageCost).toBe(average);
        expect(result.locations[0].stockQuantity).toBe(Number(stock).toFixed(4));
    });
    it('allocates multi-location receipt cents deterministically', () => {
        const result = allocatePurchasePriceCorrection([row('0', '100', 'location-b'), row('4')]);
        expect(result).toMatchObject({ receiptAmount: '300.00', inventoryAmount: '80.00', varianceAmount: '220.00' });
        expect(result.locations.map(value => value.locationId)).toEqual(['location-a', 'location-b']);
    });
    it.each(['0.005', '-0.005'])('rounds %s ties symmetrically and conserves cents across many locations', delta => {
        const result = allocatePurchasePriceCorrection(Array.from({ length: 4 }, (_, i) => row('10', delta, `location-${i}`)));
        const amount = delta.startsWith('-') ? '-0.02' : '0.02';
        expect(result).toMatchObject({ receiptAmount: amount, inventoryAmount: amount, varianceAmount: '0.00' });
        expect(result.locations.every(value => delta.startsWith('-') ? Number(value.receiptAmount) <= 0 : Number(value.receiptAmount) >= 0)).toBe(true);
    });
    it('rounds partial allocation and sends residual to variance', () => {
        expect(allocatePurchasePriceCorrection([{ ...row('1', '0.01'), receivedQuantity: '3' }])).toMatchObject({ inventoryAmount: '0.00', varianceAmount: '0.01' });
    });
    it.each([{ input: [] }, { input: [row('4', '0')] }, { input: [row('4', '0.004')] }])('rejects zero R', ({ input }) => {
        expect(() => allocatePurchasePriceCorrection(input)).toThrow(/pembulatan sen/);
    });
    it('supports missing inventory at zero quantity', () => {
        expect(allocatePurchasePriceCorrection([{ ...row('0'), averageCost: null }]).locations[0].newAverageCost).toBeNull();
    });
    it.each([
        { ...row('4'), averageCost: null }, { ...row('-1') }, { ...row('4'), receivedQuantity: '0' },
        { ...row('4', '-2000') }, { ...row('4'), averageCost: 'NaN' },
    ])('rejects unsafe source/WAC', input => {
        expect(() => allocatePurchasePriceCorrection([input])).toThrow();
    });
    it('rejects duplicate locations', () => {
        expect(() => allocatePurchasePriceCorrection([row('4'), row('4')])).toThrow(/berulang/);
    });
});

describe('purchase price input', () => {
    const input = { invoiceId: 'bill', purchaseOrderItemId: 'item', newUnitPrice: '100', sourceFingerprint: 'a'.repeat(64), reason: 'Koreksi sintetis', idempotencyKey: '00000000-0000-4000-8000-000000000001', confirmed: true };
    it('canonicalizes price and trims reason for signatures', () => {
        expect(purchasePriceCorrectionInput.parse({ ...input, reason: ' Koreksi sintetis ' })).toMatchObject({ newUnitPrice: '100.0000', reason: 'Koreksi sintetis' });
    });
    it.each(['0', '-1', '1.00001', '100000000000', 'Infinity', 'NaN', '1e2'])('rejects price %s', newUnitPrice => {
        expect(purchasePriceCorrectionInput.safeParse({ ...input, newUnitPrice }).success).toBe(false);
    });
    it('requires explicit confirmation', () => {
        expect(purchasePriceCorrectionInput.safeParse({ ...input, confirmed: false }).success).toBe(false);
    });
});
