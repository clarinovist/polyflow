import { describe, expect, it } from 'vitest';
import { formatQuantitySummary, legacyScrapSummary, summarizeQuantities, UNKNOWN_UNIT } from '../quantity-summary';

describe('production quantity summaries', () => {
    it('adds like units only and never labels mixed output as kg', () => {
        const result = summarizeQuantities([{ quantity: '100', unit: 'KG' }, { quantity: 20, unit: 'PCS' }, { quantity: 2.5, unit: 'KG' }]);
        expect(result).toEqual([{ unit: 'KG', quantity: 102.5 }, { unit: 'PCS', quantity: 20 }]);
        expect(formatQuantitySummary(result)).toBe('102,5 KG · 20 PCS');
    });
    it('keeps missing units explicit and ignores nonfinite values', () => {
        expect(summarizeQuantities([{ quantity: 3 }, { quantity: Infinity, unit: 'KG' }, { quantity: 0, unit: '' }])).toEqual([{ unit: UNKNOWN_UNIT, quantity: 3 }]);
        expect(formatQuantitySummary([])).toBe('—');
    });
    it('uses existing max aggregate without double counting KG scrap', () => {
        expect(legacyScrapSummary([{ scrapQuantity: 4, scrapDaunQty: 3, scrapProngkolQty: 1 }], 'KG')).toBe('4 KG');
    });
    it('does not pretend non-KG historical scrap has a verified unit', () => {
        expect(legacyScrapSummary([{ scrapQuantity: 4 }], 'PCS')).toBe('Satuan scrap belum terverifikasi');
        expect(legacyScrapSummary([{ scrapQuantity: 0 }], 'PCS')).toBe('0');
    });
});
