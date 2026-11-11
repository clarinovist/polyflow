import { describe, expect, it } from 'vitest';
import { csvCell, csvRow } from '../csv';

describe('csvCell', () => {
    it('returns numbers as plain text, including negatives', () => {
        expect(csvCell(1500000)).toBe('1500000');
        expect(csvCell(-250000)).toBe('-250000');
        expect(csvCell(0)).toBe('0');
        expect(csvCell(12.5)).toBe('12.5');
    });

    it('returns empty string for null and undefined', () => {
        expect(csvCell(null)).toBe('');
        expect(csvCell(undefined)).toBe('');
    });

    it.each([
        ['=SUM(A1:A2)', "'=SUM(A1:A2)"],
        ['+1+1', "'+1+1"],
        ['@SUM(1)', "'@SUM(1)"],
        ['\tcmd', "'\tcmd"],
        ['\rcmd', '"\'\rcmd"'],
    ])('neutralises formula-leading string %j', (input, expected) => {
        expect(csvCell(input)).toBe(expected);
    });

    it('prefixes a minus string that is not a plain number', () => {
        expect(csvCell('-1+2')).toBe("'-1+2");
        expect(csvCell('-cmd|calc')).toBe("'-cmd|calc");
        expect(csvCell('-')).toBe("'-");
    });

    it('keeps a numeric-looking negative string untouched', () => {
        expect(csvCell('-5')).toBe('-5');
        expect(csvCell('-12.75')).toBe('-12.75');
    });

    it('does not prefix harmless strings', () => {
        expect(csvCell('Budi Santoso')).toBe('Budi Santoso');
        expect(csvCell('a=b')).toBe('a=b');
        expect(csvCell('')).toBe('');
    });

    it('quotes values containing commas, quotes or newlines', () => {
        expect(csvCell('a,b')).toBe('"a,b"');
        expect(csvCell('say "hi"')).toBe('"say ""hi"""');
        expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
        expect(csvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
    });

    it('prefixes then quotes when both apply', () => {
        expect(csvCell('=HYPERLINK("x","y")')).toBe(
            '"\'=HYPERLINK(""x"",""y"")"',
        );
        expect(csvCell('=1,2')).toBe('"\'=1,2"');
    });
});

describe('csvRow', () => {
    it('joins cells with commas using csvCell rules', () => {
        expect(csvRow(['A001', 'Acme, Inc', -100, null, '=x'])).toBe(
            "A001,\"Acme, Inc\",-100,,'=x",
        );
    });
});
