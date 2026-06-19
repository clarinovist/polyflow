import { describe, expect, it } from 'vitest';

import { formatRupiah } from './utils';

describe('formatRupiah', () => {
    it('returns dash for null and undefined', () => {
        expect(formatRupiah(null)).toBe('-');
        expect(formatRupiah(undefined)).toBe('-');
    });

    it('formats positive integer in IDR locale', () => {
        const result = formatRupiah(15000);
        expect(result).toMatch(/(Rp|IDR)/);
        expect(result).toMatch(/15[\.,]000/);
    });

    it('formats decimal with max two fraction digits', () => {
        const result = formatRupiah(1234.567);
        expect(result).toMatch(/(Rp|IDR)/);
        expect(result).toMatch(/1[\.,]234/);
        expect(result).toMatch(/[\.,]\d{1,2}$/);
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
