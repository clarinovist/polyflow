import { describe, expect, it } from 'vitest';
import { quickReturnPostSchema, quickReturnSelectionSchema } from '../quick-sales-return';
const selection = { salesOrderId: 'order', items: [{ productVariantId: 'sku', quantity: '2.1250' }] };
describe('quick return quantity-only input', () => {
    it('accepts quantities with four decimals but strips client pricing/customer/stock fields', () => {
        expect(quickReturnSelectionSchema.parse({ ...selection, customerId: 'foreign', returnLocationId: 'foreign', items: [{ ...selection.items[0], unitPrice: 1 }] })).toEqual(selection);
    });
    it.each(['0', '-1', '1e3', 'NaN', 'Infinity', '1,000', '1.12345', '100000000000'])('rejects unsafe quantity %s', quantity => {
        expect(quickReturnSelectionSchema.safeParse({ ...selection, items: [{ productVariantId: 'sku', quantity }] }).success).toBe(false);
    });
    it('rejects empty and duplicate item lists and unconfirmed posting', () => {
        expect(quickReturnSelectionSchema.safeParse({ ...selection, items: [] }).success).toBe(false);
        expect(quickReturnSelectionSchema.safeParse({ ...selection, items: [...selection.items, ...selection.items] }).success).toBe(false);
        expect(quickReturnPostSchema.safeParse({ selection, requestId: '6ea38d39-b362-40bb-a29b-0649b1f5f182', fingerprint: 'a'.repeat(64), confirmed: false }).success).toBe(false);
    });
});
