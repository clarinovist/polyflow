import { describe, expect, it } from 'vitest';
import { resolveAccountLedgerRange } from '../account-ledger-range';

const now = new Date('2026-08-31T18:00:00Z');
describe('account ledger calendar range', () => {
    it('defaults to the current WIB month, not the server month', () => {
        expect(resolveAccountLedgerRange({}, now)).toEqual({
            from: '2026-09-01', to: '2026-09-30',
        });
    });
    it('keeps an explicit historical range', () => {
        expect(resolveAccountLedgerRange({ startDate: '2026-06-01', endDate: '2026-06-30' }, now))
            .toEqual({ from: '2026-06-01', to: '2026-06-30' });
    });
    it('defaults each omitted endpoint and handles leap years', () => {
        expect(resolveAccountLedgerRange({ startDate: '2024-02-03' }, new Date('2024-02-10T00:00:00Z')))
            .toEqual({ from: '2024-02-03', to: '2024-02-29' });
        expect(resolveAccountLedgerRange({ endDate: '2026-09-08' }, now))
            .toEqual({ from: '2026-09-01', to: '2026-09-08' });
    });
    it.each(['', 'garbage', '2026-02-30', '2026-7-01', ['2026-07-01'], '2026-07-01T00:00:00Z'])
    ('rejects invalid query dates %j', (startDate) => {
        expect(() => resolveAccountLedgerRange({ startDate }, now)).toThrow();
    });
    it('rejects reversed dates', () => {
        expect(() => resolveAccountLedgerRange({ startDate: '2026-09-30', endDate: '2026-09-01' }, now)).toThrow();
    });
});
