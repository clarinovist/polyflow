import { describe, expect, it } from 'vitest';
import { materialSourceTag } from '../material-source';

describe('materialSourceTag', () => {
    it('is "erp" when the price still equals the ERP price', () => {
        expect(materialSourceTag({ price: 14500, erpPrice: 14500 })).toBe('erp');
    });

    it('is "edited" when the price differs from the ERP price', () => {
        expect(materialSourceTag({ price: 38000, erpPrice: 36500 })).toBe(
            'edited',
        );
    });

    it('is "manual" when there is no ERP price and a price was typed', () => {
        expect(materialSourceTag({ price: 2400, erpPrice: null })).toBe(
            'manual',
        );
    });

    it('is "empty" when there is neither an ERP price nor a typed price', () => {
        expect(materialSourceTag({ price: 0, erpPrice: null })).toBe('empty');
    });
});
