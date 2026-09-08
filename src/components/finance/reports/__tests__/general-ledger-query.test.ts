import { describe, expect, it } from 'vitest';
import {
    buildGeneralLedgerHref,
    parseGeneralLedgerQuery,
} from '../general-ledger-query';

describe('general ledger drilldown query', () => {
    it('builds an account link that keeps the selected WIB cutoff', () => {
        expect(buildGeneralLedgerHref('acc-AP_01', '2026-09-08')).toBe(
            '/finance/reports/general-ledger?account=acc-AP_01&to=2026-09-08',
        );
    });

    it('accepts one safe account id and a real calendar date', () => {
        expect(
            parseGeneralLedgerQuery({
                account: 'acc-AP_01',
                to: '2026-09-08',
            }),
        ).toEqual({ accountId: 'acc-AP_01', toDate: '2026-09-08' });
    });

    it('drops malformed or ambiguous URL input', () => {
        expect(
            parseGeneralLedgerQuery({
                account: ['acc-1', 'acc-2'],
                to: '2026-02-30',
            }),
        ).toEqual({});
        expect(
            parseGeneralLedgerQuery({
                account: '../unsafe',
                to: ['2026-09-08'],
            }),
        ).toEqual({});
    });
});
