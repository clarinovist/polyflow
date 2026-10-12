import { describe, expect, it } from 'vitest';
import {
    buildGeneralLedgerHref,
    buildGeneralLedgerSearchHref,
    parseGeneralLedgerQuery,
} from '../general-ledger-query';

describe('general ledger drilldown query', () => {
    it('builds an account link that keeps the selected WIB cutoff', () => {
        expect(buildGeneralLedgerHref('acc-AP_01', '2026-09-08')).toBe(
            '/finance/reports/general-ledger?account=acc-AP_01&to=2026-09-08',
        );
    });

    it('accepts one safe account id, range, keyword and search mode', () => {
        expect(
            parseGeneralLedgerQuery({
                account: 'acc-AP_01',
                from: '2026-09-01',
                to: '2026-09-08',
                q: 'solar ali temanggung',
                mode: 'expenses',
            }),
        ).toEqual({
            accountId: 'acc-AP_01',
            startDate: '2026-09-01',
            toDate: '2026-09-08',
            search: 'solar ali temanggung',
            mode: 'expenses',
        });
    });

    it('builds a reusable search link for assistant evidence', () => {
        expect(
            buildGeneralLedgerSearchHref({
                query: 'solar ali',
                startDate: '2026-09-01',
                endDate: '2026-09-30',
                mode: 'expenses',
            }),
        ).toBe(
            '/finance/reports/general-ledger?q=solar+ali&from=2026-09-01&to=2026-09-30&mode=expenses',
        );
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
                from: 'invalid',
                to: ['2026-09-08'],
                q: ['one', 'two'],
                mode: 'everything',
            }),
        ).toEqual({});
    });
});
