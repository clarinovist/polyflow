import { describe, expect, it } from 'vitest';
import {
    LOW_STOCK_THRESHOLD_KG,
    STOCK_LEVEL_LABEL,
    classifyStockLevel,
    classifyStockRow,
    countStockLevels,
    resolveLowStockThreshold,
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

describe('resolveLowStockThreshold', () => {
    it('uses the product minimum when it is a positive number', () => {
        expect(resolveLowStockThreshold(100)).toBe(100);
        expect(resolveLowStockThreshold('40.5000')).toBe(40.5);
        expect(resolveLowStockThreshold({ toString: () => '60' })).toBe(60);
    });

    it('falls back to the 25 kg default when the minimum is not usable', () => {
        expect(resolveLowStockThreshold(null)).toBe(LOW_STOCK_THRESHOLD_KG);
        expect(resolveLowStockThreshold(undefined)).toBe(LOW_STOCK_THRESHOLD_KG);
        expect(resolveLowStockThreshold(0)).toBe(LOW_STOCK_THRESHOLD_KG);
        expect(resolveLowStockThreshold(-5)).toBe(LOW_STOCK_THRESHOLD_KG);
        expect(resolveLowStockThreshold('abc')).toBe(LOW_STOCK_THRESHOLD_KG);
    });
});

describe('classifyStockRow', () => {
    it('judges each product against its own minimum', () => {
        expect(classifyStockRow({ quantity: 60, minStockAlert: 100 })).toBe(
            'LOW',
        );
        expect(classifyStockRow({ quantity: 60, minStockAlert: null })).toBe(
            'OK',
        );
        expect(classifyStockRow({ quantity: 10, minStockAlert: null })).toBe(
            'LOW',
        );
    });

    it('is depleted at zero whatever the minimum is', () => {
        expect(classifyStockRow({ quantity: 0, minStockAlert: 100 })).toBe(
            'DEPLETED',
        );
    });
});

describe('countStockLevels', () => {
    it('counts rows per level', () => {
        expect(
            countStockLevels(['DEPLETED', 'DEPLETED', 'LOW', 'OK', 'OK', 'OK']),
        ).toEqual({ DEPLETED: 2, LOW: 1, OK: 3 });
    });

    it('returns zeros for an empty list', () => {
        expect(countStockLevels([])).toEqual({
            DEPLETED: 0,
            LOW: 0,
            OK: 0,
        });
    });
});
