import { describe, expect, it } from 'vitest';
import { outputReportHref, parseOutputReportFilter, reportPresets } from '../output-report';

describe('output report filter', () => {
    it('defaults using WIB rather than browser/server date', () => {
        expect(parseOutputReportFilter({}, new Date('2026-08-31T18:00:00Z'))).toMatchObject({ from: '2026-09-01', to: '2026-09-01', mode: 'product', page: 1 });
    });
    it.each([
        { from: '2026-02-30' }, { from: 'bad' }, { from: '2026-10-01', to: '2026-09-01' },
        { from: '2025-01-01', to: '2026-01-02' }, { process: 'bad' }, { mode: 'toString' },
        { page: '0' }, { page: '1.5' }, { page: '99999999' }, { q: 'x'.repeat(121) },
        { operatorId: "' OR 1=1" }, { machineId: 'a'.repeat(101) }, { q: ['a', 'b'] },
    ])('rejects invalid filters %j', params => {
        expect(() => parseOutputReportFilter(params)).toThrow();
    });
    it('accepts leap-day, max period and valid IDs/mode/process', () => {
        expect(parseOutputReportFilter({ from: '2024-01-01', to: '2024-12-31', mode: 'entries', process: 'OTHER', operatorId: 'unassigned' })).toMatchObject({ mode: 'entries', process: 'OTHER' });
    });
    it('preserves combined filters in drilldown and safely encodes search', () => {
        const filter = parseOutputReportFilter({ q: 'A & B', machineId: 'machine-1', from: '2026-09-01', to: '2026-09-10' });
        const href = outputReportHref(filter, { mode: 'entries', productVariantId: 'product-1', page: 1 });
        const params = new URL(href, 'http://localhost').searchParams;
        expect(params.get('q')).toBe('A & B');
        expect(params.get('machineId')).toBe('machine-1');
        expect(params.get('productVariantId')).toBe('product-1');
        expect(params.has('operatorId')).toBe(false);
    });
    it('presets handle year rollover and leap February', () => {
        expect(reportPresets('2026-01-05')[2]).toEqual({ label: 'Bulan lalu', from: '2025-12-01', to: '2025-12-31' });
        expect(reportPresets('2024-03-02')[2].to).toBe('2024-02-29');
    });
});
