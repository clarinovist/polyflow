import { describe, expect, it } from 'vitest';
import {
    EMPTY_VALUE,
    formatAffalPercent,
    formatAmount,
    formatCount,
    formatDecimal,
    formatKg,
    formatPercent,
    formatUnitQuantity,
} from '../format';

describe('formatKg', () => {
    it('uses id-ID separators with two decimals and the unit', () => {
        expect(formatKg(14570.98)).toBe('14.570,98 kg');
        expect(formatKg(1000)).toBe('1.000,00 kg');
    });

    it('keeps a recorded zero distinct from missing data', () => {
        expect(formatKg(0)).toBe('0,00 kg');
        expect(formatKg(null)).toBe(EMPTY_VALUE);
        expect(formatKg(undefined)).toBe(EMPTY_VALUE);
        expect(formatKg(Number.NaN)).toBe(EMPTY_VALUE);
    });

    it('rounds to two decimals', () => {
        expect(formatKg(731.286)).toBe('731,29 kg');
    });
});

describe('formatCount', () => {
    it('has no decimals and uses a thousands dot', () => {
        expect(formatCount(1234567)).toBe('1.234.567');
        expect(formatCount(94)).toBe('94');
        expect(formatCount(0)).toBe('0');
    });

    it('returns the empty marker for missing values', () => {
        expect(formatCount(null)).toBe(EMPTY_VALUE);
    });
});

describe('formatPercent', () => {
    it('uses one decimal with a decimal comma', () => {
        expect(formatPercent(4.8)).toBe('4,8%');
        expect(formatPercent(17.45)).toBe('17,5%');
        expect(formatPercent(0)).toBe('0,0%');
    });

    it('returns the empty marker for missing values', () => {
        expect(formatPercent(null)).toBe(EMPTY_VALUE);
        expect(formatPercent(Number.NaN)).toBe(EMPTY_VALUE);
    });
});

describe('formatDecimal', () => {
    it('formats with the requested digits', () => {
        expect(formatDecimal(1234.5, 1)).toBe('1.234,5');
        expect(formatDecimal(1.3703916666666667, 1)).toBe('1,4');
    });

    it('returns the empty marker for missing values', () => {
        expect(formatDecimal(undefined, 1)).toBe(EMPTY_VALUE);
    });
});

describe('formatUnitQuantity', () => {
    it('uses two decimals for kg and none for karung and pcs', () => {
        expect(formatUnitQuantity(1000, 'kg')).toBe('1.000,00 kg');
        expect(formatUnitQuantity(1500, 'karung')).toBe('1.500 karung');
        expect(formatUnitQuantity(20, 'pcs')).toBe('20 pcs');
    });

    it('matches units case-insensitively', () => {
        expect(formatUnitQuantity(2.5, 'KG')).toBe('2,50 kg');
        expect(formatUnitQuantity(3, 'Karung')).toBe('3 karung');
    });

    it('falls back to two decimals plus the raw unit for other units', () => {
        expect(formatUnitQuantity(12.5, 'roll')).toBe('12,50 roll');
    });

    it('returns the empty marker for missing values', () => {
        expect(formatUnitQuantity(null, 'kg')).toBe(EMPTY_VALUE);
    });
});

describe('formatAffalPercent', () => {
    it('shows a dash when the share cannot be computed', () => {
        expect(formatAffalPercent(null)).toBe(EMPTY_VALUE);
    });

    it('formats a computed share', () => {
        expect(formatAffalPercent(17.5)).toBe('17,5%');
    });
});

describe('formatAmount', () => {
    it('keeps whole numbers whole and trims to two decimals', () => {
        expect(formatAmount(1500)).toBe('1.500');
        expect(formatAmount(14570.98)).toBe('14.570,98');
        expect(formatAmount(731.286)).toBe('731,29');
    });

    it('keeps a recorded zero distinct from missing data', () => {
        expect(formatAmount(0)).toBe('0');
        expect(formatAmount(null)).toBe(EMPTY_VALUE);
    });
});

