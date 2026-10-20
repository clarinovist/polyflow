import { describe, expect, it } from 'vitest';
import { previewDeliveryRevision, getRevisionOrderQuantity } from '../delivery-revision-preview';
import { getDeliveryLoadWeightKg } from '../delivery-weight';

const item = { ordered: 100, delivered: 20, load: 30, unitPrice: 10, discountPercent: 10, taxPercent: 10, ppnMode: 'EXCLUDE' as const };
describe('revision preview', () => {
    it('keeps residual by default without silently reducing the commercial order', () => {
        expect(previewDeliveryRevision([item], [], 'KEEP', 10)).toEqual({ quantities: [100], totalAmount: 1000 });
    });
    it('includes previous deliveries, discounts, PPN, additions and shipping when closing', () => {
        expect(previewDeliveryRevision([item], [{ quantity: 2, unitPrice: 50, taxPercent: 11, ppnMode: 'INCLUDE' }], 'CLOSE', 10)).toEqual({ quantities: [50], totalAmount: 605 });
    });
    it('increases SO only when delivered + new load exceeds ordered', () => {
        expect(getRevisionOrderQuantity(100, 20, 90, 'KEEP')).toBe(110);
        expect(getRevisionOrderQuantity(100, 20, 0, 'CLOSE')).toBe(20);
        expect(getRevisionOrderQuantity(1, 0.1, 0.2, 'CLOSE')).toBe(0.3);
    });
    it('preserves zero/free-price lines', () => {
        expect(previewDeliveryRevision([{ ...item, unitPrice: 0 }], [], 'CLOSE', 0).totalAmount).toBe(0);
    });
});

describe('current SJ load weight', () => {
    it('uses primary kg without multiplying by packaging conversion', () => {
        expect(getDeliveryLoadWeightKg([{ quantity: 125, enteredUnit: 'BAL', conversionFactorSnapshot: 25, productVariant: { primaryUnit: 'KG' } }])).toBe(125);
    });
    it('uses historical primary-units-per-kg factor, not stale entered quantity', () => {
        expect(getDeliveryLoadWeightKg([{ quantity: 200, enteredUnit: 'KG', enteredQuantity: 99, conversionFactorSnapshot: 2, productVariant: { primaryUnit: 'PCS' } }])).toBe(100);
    });
    it.each([undefined, 0, -1, NaN, Infinity])('rejects unknown factor %s rather than partial weight', (factor) => {
        expect(getDeliveryLoadWeightKg([{ quantity: 10, enteredUnit: 'KG', conversionFactorSnapshot: factor, productVariant: { primaryUnit: 'PCS' } }])).toBeNull();
    });
    it.each([undefined, -1, NaN, Infinity])('rejects invalid quantity %s', (quantity) => {
        expect(getDeliveryLoadWeightKg([{ quantity, productVariant: { primaryUnit: 'KG' } }])).toBeNull();
    });
    it('ignores zero rows, but never assumes unknown positive units are kilograms', () => {
        expect(getDeliveryLoadWeightKg([{ quantity: 0 }])).toBe(0);
        expect(getDeliveryLoadWeightKg([{ quantity: 10 }])).toBeNull();
        expect(getDeliveryLoadWeightKg([{ quantity: 0.1, productVariant: { primaryUnit: 'KG' } }, { quantity: 0.2, productVariant: { primaryUnit: 'KG' } }])).toBe(0.3);
    });
});
