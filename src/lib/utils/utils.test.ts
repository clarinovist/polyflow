import { describe, expect, it } from 'vitest';

import {
    formatQuantity,
    formatRupiah,
    isQuantityLessThan,
    sumQuantities,
    toDecimalNumber,
} from './utils';

describe('formatRupiah', () => {
    it('returns dash for null and undefined', () => {
        expect(formatRupiah(null)).toBe('-');
        expect(formatRupiah(undefined)).toBe('-');
    });

    it('formats positive integer in IDR locale', () => {
        const result = formatRupiah(15000);
        expect(result).toMatch(/(Rp|IDR)/);
        expect(result).toMatch(/15[\\.,]000/);
    });

    it('formats decimal as whole number (no decimals)', () => {
        const result = formatRupiah(1234.567);
        expect(result).toMatch(/(Rp|IDR)/);
        expect(result).toMatch(/1[\\.,]235/);
        expect(result).not.toMatch(/[\\.,]\\d{1,2}$/);
    });

    it('formats zero correctly', () => {
        const result = formatRupiah(0);
        expect(result).toMatch(/(Rp|IDR)/);
        expect(result).toMatch(/0/);
    });

    it('formats negative value with parentheses (accounting style)', () => {
        const result = formatRupiah(-2500);
        // Intl.NumberFormat('id-ID') uses non-breaking space (U+00A0) after Rp
        expect(result).toMatch(/^\(Rp\u00a02\.500\)$/);
        expect(result).not.toContain('-');
    });

    it('formats large negative value with parentheses', () => {
        const result = formatRupiah(-128196020);
        expect(result).toMatch(/^\(Rp\u00a0128\.196\.020\)$/);
    });
});

describe('quantity precision contract', () => {
    it('formats Indonesian quantities with at most four decimals', () => {
        expect(formatQuantity(50.8)).toBe('50,8');
        expect(formatQuantity(16.0508)).toBe('16,0508');
        expect(formatQuantity(100)).toBe('100');
        expect(formatQuantity(null)).toBe('-');
        expect(formatQuantity(undefined)).toBe('-');
        expect(formatQuantity(Number.NaN)).toBe('0');
        expect(formatQuantity(Number.POSITIVE_INFINITY)).toBe('0');
    });

    it('hides binary floating-point artifacts after aggregation', () => {
        const raw = 50.8 + 16.0508;

        expect(raw).toBe(66.85079999999999);
        expect(sumQuantities([50.8, 16.0508])).toBe(66.8508);
        expect(formatQuantity(raw)).toBe('66,8508');
    });

    it('compares stock thresholds at the four-decimal domain scale', () => {
        expect(isQuantityLessThan(0.1 + 0.2, 0.3)).toBe(false);
        expect(isQuantityLessThan(0.2999, 0.3)).toBe(true);
    });
});

describe('toDecimalNumber', () => {
    it('handles null, undefined, and number', () => {
        expect(toDecimalNumber(null)).toBe(0);
        expect(toDecimalNumber(undefined)).toBe(0);
        expect(toDecimalNumber(1500000)).toBe(1500000);
    });

    it('parses serialized Decimal strings (Server Action flight path)', () => {
        // Prisma Decimal.toJSON() → string; client must not call .toNumber()
        expect(toDecimalNumber('1500000')).toBe(1500000);
        expect(toDecimalNumber('1.5')).toBe(1.5);
        expect(toDecimalNumber('')).toBe(0);
    });

    it('duck-types Prisma Decimal objects', () => {
        expect(toDecimalNumber({ toNumber: () => 42 })).toBe(42);
    });

    it('does not throw when value has no toNumber (regression for loans page)', () => {
        expect(() => toDecimalNumber({ foo: 1 })).not.toThrow();
        expect(toDecimalNumber({ foo: 1 })).toBe(0);
    });
});
