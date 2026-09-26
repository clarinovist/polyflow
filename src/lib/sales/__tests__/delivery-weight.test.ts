import { describe, expect, it } from 'vitest';
import { estimateDeliveryWeightKg } from '../delivery-weight';

const kgItem = (overrides = {}) => ({
    quantity: '750', deliveredQty: '250', enteredQuantity: '150', enteredUnit: 'BAL',
    productVariant: { primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: '10' },
    ...overrides,
});

describe('estimateDeliveryWeightKg', () => {
    it('uses remaining base kg independent of a changed product factor or entered packaging count', () => {
        expect(estimateDeliveryWeightKg([kgItem(), kgItem({ deliveredQty: 0 })])).toBe(1250);
    });
    it('uses stored KG quantity proportionally when the primary unit is a count', () => {
        expect(estimateDeliveryWeightKg([kgItem({
            quantity: 100, deliveredQty: 20, enteredQuantity: 500, enteredUnit: 'KG',
            productVariant: { primaryUnit: 'BAL', salesUnit: 'KG', conversionFactor: 99 },
        })])).toBe(400);
    });
    it('converts legacy primary counts to a configured KG sales unit', () => {
        expect(estimateDeliveryWeightKg([kgItem({
            quantity: 100, deliveredQty: 20, enteredQuantity: null, enteredUnit: null,
            productVariant: { primaryUnit: 'BAL', salesUnit: 'KG', conversionFactor: '0.2' },
        })])).toBe(400);
    });
    it('does not invent kg or return a partial weight for mixed weight and count items', () => {
        expect(estimateDeliveryWeightKg([kgItem(), kgItem({
            productVariant: { primaryUnit: 'PCS', salesUnit: 'BAL', conversionFactor: 10 },
        })])).toBeNull();
        expect(estimateDeliveryWeightKg([kgItem({ productVariant: null })])).toBeNull();
    });
    it('ignores services and fully delivered lines even if their unit is not KG', () => {
        expect(estimateDeliveryWeightKg([
            kgItem(),
            kgItem({ productVariant: { primaryUnit: 'PCS', product: { productType: 'SERVICE' } } }),
            kgItem({ quantity: 100, deliveredQty: 120, productVariant: { primaryUnit: 'PCS' } }),
        ])).toBe(500);
        expect(estimateDeliveryWeightKg([])).toBe(0);
    });
    it.each([0, -1, null, undefined, 'invalid', Infinity])('rejects unavailable/invalid legacy KG factor %s', (factor) => {
        expect(estimateDeliveryWeightKg([kgItem({
            enteredUnit: null, enteredQuantity: null,
            productVariant: { primaryUnit: 'BAL', salesUnit: 'KG', conversionFactor: factor },
        })])).toBeNull();
    });
    it.each([0, -1, 'invalid', Infinity])('rejects invalid KG snapshot quantity %s', (enteredQuantity) => {
        expect(estimateDeliveryWeightKg([kgItem({
            enteredUnit: 'KG', enteredQuantity, productVariant: { primaryUnit: 'BAL' },
        })])).toBeNull();
    });
    it.each([
        { quantity: -1 }, { quantity: 'invalid' }, { quantity: Infinity },
        { deliveredQty: -1 }, { deliveredQty: 'invalid' },
    ])('rejects invalid base quantities: %j', (overrides) => {
        expect(estimateDeliveryWeightKg([kgItem(overrides)])).toBeNull();
    });
    it('rounds decimal residue to storage precision', () => {
        expect(estimateDeliveryWeightKg([kgItem({ quantity: '0.3', deliveredQty: '0.1' })])).toBe(0.2);
    });
});
