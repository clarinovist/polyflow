import { describe, expect, it } from 'vitest';
import { fieldEntryMeta, fieldEntryPayload, serializeFieldUnits } from '../field-order-units';
import { convertSalesEntry, salesEntryForEdit } from '../unit-entry';
const units = { primaryUnit: 'KG' as const, salesUnit: 'BAL' as const, conversionFactor: 25 };
const entry = { productVariantId: 'v', quantity: 1250, unitPrice: 18500, enteredUnit: 'KG' as const };
describe('field/mobile unit contract', () => {
    it('sends explicit KG and converts BAL in both directions without changing money', () => {
        const kg = fieldEntryPayload(entry, units);
        expect(kg).toEqual({ quantity: 1250, unitPrice: 18500, enteredQuantity: 1250, enteredUnitPrice: 18500, enteredUnit: 'KG', conversionFactorSnapshot: 1 });
        const bal = { ...entry, ...convertSalesEntry(entry, fieldEntryMeta(units, entry), 'BAL') };
        expect(bal).toMatchObject({ quantity: 50, unitPrice: 462500 });
        expect(fieldEntryPayload(bal, units)).toMatchObject({ quantity: 1250, unitPrice: 18500, enteredUnit: 'BAL', conversionFactorSnapshot: 25 });
        expect(serializeFieldUnits({ ...units, conversionFactor: '25.0000' })).toEqual(units);
    });
    it('preserves legacy no-snapshot and historical rounded price, but validates actual edits', () => {
        for (const saved of [
            { id: 'old', productVariantId: 'v', quantity: 3, unitPrice: 33.33, enteredQuantity: 1, enteredUnit: 'BAL', enteredUnitPrice: 100, conversionFactorSnapshot: 3 },
            { id: 'old', productVariantId: 'v', quantity: 1250, unitPrice: 18500 },
        ]) {
            const original = { ...saved, ...salesEntryForEdit({ ...saved, productVariant: units }) };
            expect(fieldEntryPayload(original, units, original)).toMatchObject({ quantity: saved.quantity, unitPrice: saved.unitPrice });
            if (saved.enteredUnit) {
                expect(fieldEntryMeta({ ...units, salesUnit: 'ZAK', conversionFactor: 50 }, original, original)).toMatchObject({ salesUnit: 'BAL', conversionFactor: 3 });
                expect(() => fieldEntryPayload({ ...original, unitPrice: 101 }, units, original)).toThrow(/disimpan tepat/);
            } else expect(fieldEntryPayload(original, units, original).enteredUnit).toBeUndefined();
        }
    });
    it('supports fractional quantity but rejects overprecision, nonfinite and invalid factors/units', () => {
        expect(fieldEntryPayload({ ...entry, quantity: .5 }, units).quantity).toBe(.5);
        for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: Infinity }, { unitPrice: NaN }, { unitPrice: -1 }, { quantity: .00001 }, { quantity: 1e-10 }]) {
            expect(() => fieldEntryPayload({ ...entry, ...patch }, units)).toThrow();
        }
        expect(fieldEntryPayload({ ...entry, quantity: .0001 }, units).quantity).toBe(.0001);
        expect(() => fieldEntryPayload({ ...entry, quantity: .0001, enteredUnit: 'BAL' }, { ...units, conversionFactor: .0001 })).toThrow(/terlalu kecil/);
        const bal = { ...entry, quantity: .04004, unitPrice: 462500, enteredUnit: 'BAL' as const };
        expect(() => fieldEntryPayload(bal, units)).toThrow(/disimpan tepat/);
        expect(() => fieldEntryPayload({ ...entry, enteredUnit: 'BAL' }, { ...units, conversionFactor: 0 })).toThrow(/Faktor/);
        expect(() => fieldEntryMeta(units, { ...entry, enteredUnit: 'PCS' })).toThrow(/berubah/);
        expect(() => fieldEntryMeta({ ...units, primaryUnit: '' as never }, entry)).toThrow(/belum tersedia/);
    });
});
