import { describe, expect, it } from 'vitest';
import { calculateInvoiceRounding, invoiceAmountsForPolicy } from '../invoice-rounding';

describe('invoice rounding: ceil to Rp500 at currency precision', () => {
    it.each([
        [16642320, 16642500, 180], [16642500, 16642500, 0],
        [16642501, 16643000, 499], [16642999, 16643000, 1],
        [16643000, 16643000, 0], [0, 0, 0], [0.01, 500, 499.99],
        [499.99, 500, 0.01], [500.01, 1000, 499.99],
        [1000.0000000001, 1000, 0], [499.9999999999, 500, 0],
    ])('%s -> %s (adjustment %s)', (base, totalAmount, roundingAmount) => {
        expect(calculateInvoiceRounding(base)).toEqual({ totalAmount, roundingAmount });
    });
    it.each([-1, NaN, Infinity, -Infinity, 9999999999999.99])('rejects invalid/overflow amount %s', amount => {
        expect(() => calculateInvoiceRounding(amount)).toThrow();
    });
    it('legacy null/absent policy is not zero', () => {
        expect(invoiceAmountsForPolicy(1320, null)).toEqual({ totalAmount: 1320 });
        expect(invoiceAmountsForPolicy(1320, undefined)).toEqual({ totalAmount: 1320 });
        expect(invoiceAmountsForPolicy(1320, 0)).toEqual({ totalAmount: 1500, roundingAmount: 180 });
    });
});
