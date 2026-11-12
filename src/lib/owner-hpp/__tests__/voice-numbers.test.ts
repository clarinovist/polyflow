import { describe, expect, it } from 'vitest';
import {
    extractNumbers,
    isSpokenNumber,
    normalizeNumber,
} from '../voice-numbers';

describe('extractNumbers', () => {
    it.each([
        ['harga 14.500 per kilo', 14500],
        ['harga 14500 per kilo', 14500],
        ['Rp 15.250', 15250],
        ['scrap 2,5%', 2.5],
        ['500 ribu', 500000],
        ['14 ribu', 14000],
        ['1,2 juta', 1200000],
        ['tiga persen', 3],
        ['seratus dua puluh kilo', 120],
        ['empat belas ribu lima ratus', 14500],
        ['dua koma lima', 2.5],
        ['lima belas', 15],
        ['lima puluh', 50],
        ['sebelas', 11],
        ['seribu lima ratus', 1500],
        ['dua juta lima ratus ribu', 2500000],
        ['2 koma 5 persen', 2.5],
        ['500 rb', 500000],
        ['120kg', 120],
    ])('reads "%s" as %s', (text, expected) => {
        expect(extractNumbers(text)).toContain(expected);
    });

    it('keeps 14 ribu and 40 ribu apart', () => {
        expect(extractNumbers('14 ribu')).not.toContain(40000);
        expect(extractNumbers('40 ribu')).not.toContain(14000);
    });

    it('keeps 15 and 50 apart', () => {
        expect(extractNumbers('lima belas')).not.toContain(50);
        expect(extractNumbers('lima puluh')).not.toContain(15);
        expect(extractNumbers('15')).not.toContain(50);
    });

    it('offers both readings for a lone dotted group', () => {
        expect(extractNumbers('1.250')).toEqual([1250, 1.25]);
    });

    it('reads a leading-zero dotted number as a decimal only', () => {
        expect(extractNumbers('0.920')).toEqual([0.92]);
    });

    it('never invents a x1000 variant of a spoken number', () => {
        expect(extractNumbers('harga 14.500')).not.toContain(14500000);
        expect(extractNumbers('harga 14.500.000')).not.toContain(14500);
    });

    it('reads a compound like "14 ribu 500"', () => {
        expect(extractNumbers('14 ribu 500')).toContain(14500);
    });

    it('finds several numbers in one sentence in order', () => {
        const numbers = extractNumbers(
            'tambah benang 120 kilo harga empat belas ribu lima ratus scrap tiga persen',
        );
        expect(numbers).toEqual([120, 14500, 3]);
    });

    it('splits two adjacent digit words into two numbers', () => {
        expect(extractNumbers('satu dua')).toEqual([1, 2]);
    });

    it('returns nothing for text without numbers', () => {
        expect(extractNumbers('ganti harga jual')).toEqual([]);
        expect(extractNumbers('')).toEqual([]);
    });

    it('ignores a malformed literal', () => {
        expect(extractNumbers('1.2.3')).toEqual([]);
    });

    it('reads a comma decimal with a trailing scale word', () => {
        expect(extractNumbers('satu koma dua juta')).toContain(1200000);
    });
});

describe('isSpokenNumber', () => {
    it('accepts only an exact match', () => {
        const spoken = extractNumbers('harga 14.500');
        expect(isSpokenNumber(14500, spoken)).toBe(true);
        expect(isSpokenNumber(14500000, spoken)).toBe(false);
        expect(isSpokenNumber(14501, spoken)).toBe(false);
    });

    it('ignores float noise', () => {
        expect(isSpokenNumber(0.1 + 0.2, [0.3])).toBe(true);
        expect(normalizeNumber(1.2 * 1_000_000)).toBe(1_200_000);
    });
});
