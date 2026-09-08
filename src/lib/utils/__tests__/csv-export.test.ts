// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv, encodeCsvField, reportFilename, rupiahForCsv } from '../csv-export';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('safe CSV cells', () => {
    it('downloads safe rows and releases the temporary link', async () => {
        const create = vi.fn((_blob: Blob) => 'blob:test');
        const revoke = vi.fn();
        vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        downloadCsv('test.csv', ['Text', 'Number'], [['=1+1', -2.5]]);
        const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsText(create.mock.calls[0][0]);
        });
        expect(content).toContain(`"'=1+1","-2.5"`);
        expect(click).toHaveBeenCalledOnce();
        expect(revoke).toHaveBeenCalledWith('blob:test');
        expect(document.querySelector('a[download]')).toBeNull();
    });
    it('formats report filenames and rounded Rupiah values', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));
        expect(reportFilename('report')).toBe('report_2026-08-01.csv');
        expect(reportFilename('report', '2026-07-31')).toBe('report_2026-07-31.csv');
        expect(rupiahForCsv(-12.4)).toBe('-12');
    });
    it('escapes quotes, commas and newlines', () => {
        expect(encodeCsvField('a,"b"\nc')).toBe('"a,""b""\nc"');
    });
    it.each(['=1+1', '+SUM(1,2)', '-1+2', '@SUM(1,2)', ' \t=1+1', '\r=1+1', '\ttext'])
    ('neutralizes formula/control-leading text %j', (text) => {
        expect(encodeCsvField(text)).toBe(`"'${text}"`);
    });
    it('preserves signed numeric values and existing numeric CSV strings', () => {
        expect(encodeCsvField(-42.5)).toBe('"-42.5"');
        expect(encodeCsvField('-42.50')).toBe('"-42.50"');
        expect(encodeCsvField(0)).toBe('"0"');
        expect(encodeCsvField('')).toBe('""');
    });
});
