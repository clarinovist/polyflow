import { describe, expect, it } from 'vitest';
import { draftFromNumber, formatDecimal, parseDecimalInput } from '../number-input';

describe('parseDecimalInput', () => {
    it.each([
        ['0,92', 0.92],
        ['0.92', 0.92],
        ['0.920', 0.92],
        ['14.500', 14500],
        ['14500', 14500],
        ['1.234.567,5', 1234567.5],
        ['  12  ', 12],
        ['0', 0],
        ['7,', 7],
    ])('reads "%s" as %s', (text, expected) => {
        expect(parseDecimalInput(text)).toBe(expected);
    });

    it.each([[''], ['   '], ['abc'], ['-1'], ['1e3'], ['12,3,4'], ['1.2.3'], ['Infinity']])(
        'rejects "%s"',
        (text) => {
            expect(parseDecimalInput(text)).toBeNull();
        },
    );
});

describe('formatDecimal', () => {
    it('uses Indonesian grouping and a decimal comma', () => {
        expect(formatDecimal(14500)).toBe('14.500');
        expect(formatDecimal(0.92)).toBe('0,92');
    });

    it('trims to the requested fraction digits', () => {
        expect(formatDecimal(1.23456789, 2)).toBe('1,23');
    });
});

describe('draftFromNumber', () => {
    it('is the plain editable text: no grouping, decimal comma', () => {
        expect(draftFromNumber(14500)).toBe('14500');
        expect(draftFromNumber(0.92)).toBe('0,92');
        expect(draftFromNumber(0)).toBe('0');
    });
});
