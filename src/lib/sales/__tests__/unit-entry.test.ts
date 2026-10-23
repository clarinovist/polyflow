import { describe, it, expect } from 'vitest';
import { convertSalesEntry, salesEntryForEdit, salesEntryMeta } from '../unit-entry';
const variant = { primaryUnit: 'KG', salesUnit: 'BAL', conversionFactor: 25 };
describe('sales unit entry', () => {
    it('converts quantity and unit price together', () => {
        const meta = salesEntryMeta(variant, { enteredUnit: 'KG' });
        expect(convertSalesEntry({ quantity: 1250, unitPrice: 22000 }, meta, 'BAL')).toEqual({ quantity: 50, unitPrice: 550000, enteredUnit: 'BAL' });
        expect(() => convertSalesEntry({ quantity: 1, unitPrice: 1 }, meta, 'PCS')).toThrow();
    });
    it('keeps legacy base-unit values and zero snapshot prices', () => {
        expect(salesEntryForEdit({ quantity: 1250, unitPrice: 22000, productVariant: variant })).toMatchObject({ quantity: 1250, unitPrice: 22000, enteredUnit: 'KG' });
        expect(salesEntryForEdit({ quantity: 50, unitPrice: 0, enteredUnit: 'BAL', enteredQuantity: 2, enteredUnitPrice: 0, conversionFactorSnapshot: 25 })).toMatchObject({ quantity: 2, unitPrice: 0, enteredUnit: 'BAL' });
    });
    it('retains historical unit/factor even after master sales unit changes', () => {
        expect(salesEntryMeta({ ...variant, salesUnit: 'ZAK', conversionFactor: 50 }, { enteredUnit: 'BAL' }, { enteredUnit: 'BAL', conversionFactorSnapshot: 25 })).toMatchObject({ displayUnit: 'BAL', salesUnit: 'BAL', conversionFactor: 25 });
    });
});
