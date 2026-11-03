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

describe('parseDecimalInput in quantity mode', () => {
    it('reads a lone dot as a decimal point, never as thousands', () => {
        expect(parseDecimalInput('1.250', 'quantity')).toBe(1.25);
        expect(parseDecimalInput('14.500', 'quantity')).toBe(14.5);
        expect(parseDecimalInput('0.92', 'quantity')).toBe(0.92);
    });

    it('still reads a comma as the decimal separator', () => {
        expect(parseDecimalInput('1,25', 'quantity')).toBe(1.25);
        expect(parseDecimalInput('1.234,5', 'quantity')).toBe(1234.5);
    });

    it('rejects several dots without a comma', () => {
        expect(parseDecimalInput('1.234.567', 'quantity')).toBeNull();
    });

    it('keeps money mode reading "14.500" as 14500 (the default)', () => {
        expect(parseDecimalInput('14.500')).toBe(14500);
        expect(parseDecimalInput('14.500', 'money')).toBe(14500);
    });
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
