import { describe, expect, it } from 'vitest';
import { journalMatchesPriceAdjustmentSource, type PriceAdjustmentSourceForJournal } from '../invoice-price-revenue-source';
const line = (accountId: string, debit: number, credit: number) => ({ accountId, debit, credit, currency: 'IDR', exchangeRate: 1 });
const source: PriceAdjustmentSourceForJournal = {
    totalAmount: 700, taxAmount: 0, roundingAmount: 0,
    accountsReceivableAccountId: 'ar', vatAccountId: 'vat', defaultRevenueAccountId: 'default', roundingAccountId: null,
    items: [{ sourceItemId: 'one', netAmount: 200, revenueAccountId: 'a' }, { sourceItemId: 'two', netAmount: 500, revenueAccountId: 'b' }],
    journalLines: [line('ar', 700, 0), line('a', 0, 200), line('b', 0, 500)],
};
describe('journalMatchesPriceAdjustmentSource', () => {
    it('accepts exact multi-account revenue and split lines on the same account', () => {
        expect(journalMatchesPriceAdjustmentSource(source)).toBe(true);
        expect(journalMatchesPriceAdjustmentSource({ ...source, journalLines: [line('ar', 700, 0), line('a', 0, 100), line('a', 0, 100), line('b', 0, 500)] })).toBe(true);
    });
    it('rejects mapping mismatch and extra offsetting postings on the same or different accounts', () => {
        expect(journalMatchesPriceAdjustmentSource({ ...source, items: source.items.map(i => ({ ...i, revenueAccountId: 'default' })) })).toBe(false);
        for (const extra of [[line('expense', 1, 0), line('other', 0, 1)], [line('a', 1, 0), line('a', 0, 1)]]) {
            expect(journalMatchesPriceAdjustmentSource({ ...source, journalLines: [...source.journalLines, ...extra] })).toBe(false);
        }
    });
    it('reconciles default shipping, VAT and rounding separately', () => {
        const withShipping = { ...source, totalAmount: 725, taxAmount: 10, roundingAmount: 5, roundingAccountId: 'rounding', journalLines: [line('ar', 725, 0), line('a', 0, 200), line('b', 0, 500), line('default', 0, 10), line('vat', 0, 10), line('rounding', 0, 5)] };
        expect(journalMatchesPriceAdjustmentSource(withShipping)).toBe(true);
        expect(journalMatchesPriceAdjustmentSource({ ...withShipping, roundingAccountId: null })).toBe(false);
    });
    it('accepts the default-only source', () => {
        expect(journalMatchesPriceAdjustmentSource({ ...source, items: source.items.map(i => ({ ...i, revenueAccountId: 'default' })), journalLines: [line('ar', 700, 0), line('default', 0, 700)] })).toBe(true);
    });
    it.each([
        { currency: 'USD' }, { exchangeRate: 2 }, { debit: -1 }, { credit: -1 }, { debit: 'NaN' }, { credit: 'Infinity' }, { debit: 'invalid' }, { accountId: '' },
    ])('rejects invalid journal line %j', patch => {
        expect(journalMatchesPriceAdjustmentSource({ ...source, journalLines: [{ ...source.journalLines[0], ...patch }, ...source.journalLines.slice(1)] })).toBe(false);
    });
    it.each([
        { totalAmount: 100 }, { taxAmount: -1 }, { roundingAmount: -1 }, { totalAmount: 'NaN' }, { items: [] }, { accountsReceivableAccountId: '' },
        { items: [{ sourceItemId: '', netAmount: 700, revenueAccountId: 'a' }] },
        { items: [{ sourceItemId: 'one', netAmount: -1, revenueAccountId: 'a' }] },
        { items: [{ sourceItemId: 'one', netAmount: 700, revenueAccountId: '' }] },
        { items: [source.items[0], source.items[0]] },
    ])('rejects invalid source %j', patch => {
        expect(journalMatchesPriceAdjustmentSource({ ...source, ...patch })).toBe(false);
    });
});
