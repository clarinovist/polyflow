import { describe, expect, it } from 'vitest';
import {
    LOW_STOCK_THRESHOLD_KG,
    STOCK_LEVEL_LABEL,
    classifyStockLevel,
    countStockLevels,
} from '../stock-level';

describe('classifyStockLevel', () => {
    it('treats zero as depleted', () => {
        expect(classifyStockLevel(0)).toBe('DEPLETED');
    });

    it('treats negative or missing quantity as depleted', () => {
        expect(classifyStockLevel(-3)).toBe('DEPLETED');
        expect(classifyStockLevel(null)).toBe('DEPLETED');
        expect(classifyStockLevel(undefined)).toBe('DEPLETED');
        expect(classifyStockLevel(Number.NaN)).toBe('DEPLETED');
    });

    it('treats a positive quantity below the threshold as low', () => {
        expect(classifyStockLevel(0.01)).toBe('LOW');
        expect(classifyStockLevel(LOW_STOCK_THRESHOLD_KG - 0.01)).toBe('LOW');
    });

    it('treats the threshold itself and above as ok', () => {
        expect(classifyStockLevel(LOW_STOCK_THRESHOLD_KG)).toBe('OK');
        expect(classifyStockLevel(1000)).toBe('OK');
    });

    it('accepts a custom threshold', () => {
        expect(classifyStockLevel(40, 50)).toBe('LOW');
        expect(classifyStockLevel(50, 50)).toBe('OK');
    });

    it('uses a 25 kg default threshold', () => {
        expect(LOW_STOCK_THRESHOLD_KG).toBe(25);
    });
});

describe('STOCK_LEVEL_LABEL', () => {
    it('uses Indonesian labels without raw codes', () => {
        expect(STOCK_LEVEL_LABEL).toEqual({
            DEPLETED: 'Habis',
            LOW: 'Menipis',
            OK: 'Aman',
        });
    });
});

describe('countStockLevels', () => {
    it('counts rows per level', () => {
        expect(countStockLevels([0, 0, 10, 24.99, 25, 300])).toEqual({
            DEPLETED: 2,
            LOW: 2,
            OK: 2,
        });
    });

    it('returns zeros for an empty list', () => {
        expect(countStockLevels([])).toEqual({
            DEPLETED: 0,
            LOW: 0,
            OK: 0,
        });
    });
});
