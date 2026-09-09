import { describe, expect, it } from 'vitest';

import {
    calculateBarterSummary,
    normalizePartnerName,
    statusForRemainingBalance,
    toMoneyDecimal,
} from '@/lib/finance/barter';

const examples = [
    [6_000_000, 10_000_000, 6_000_000, 4_000_000, 0, 0],
    [6_000_000, 10_000_000, 6_000_000, 0, 0, 4_000_000],
    [6_000_000, 10_000_000, 6_000_000, 2_000_000, 0, 2_000_000],
    [10_000_000, 6_000_000, 6_000_000, 0, 4_000_000, 0],
    [6_000_000, 6_000_000, 6_000_000, 0, 0, 0],
    [6_000_000, 10_000_000, 3_000_000, 2_000_000, 3_000_000, 5_000_000],
] as const;

describe('barter finance helpers', () => {
    it.each(examples)(
        'calculates AR %s AP %s B %s C %s',
        (ar, ap, barter, cash, expectedAr, expectedAp) => {
            const result = calculateBarterSummary({
                receivableBalance: ar,
                payableBalance: ap,
                barterAmount: barter,
                cashAmount: cash,
            });
            expect(result.receivableAfter.toNumber()).toBe(expectedAr);
            expect(result.payableAfter.toNumber()).toBe(expectedAp);
        },
    );

    it.each([NaN, Infinity, -1, 0, 1.001, 10_000_000_000_000])(
        'rejects invalid money %s',
        (amount) => {
            expect(() => toMoneyDecimal(amount, 'Nominal')).toThrow();
        },
    );

    it('rejects barter or cash above authoritative balance', () => {
        expect(() =>
            calculateBarterSummary({
                receivableBalance: 100,
                payableBalance: 200,
                barterAmount: 101,
            }),
        ).toThrow('Nominal barter melebihi');
        expect(() =>
            calculateBarterSummary({
                receivableBalance: 100,
                payableBalance: 200,
                barterAmount: 100,
                cashAmount: 101,
            }),
        ).toThrow('Pembayaran tambahan melebihi');
    });

    it('normalizes partner names without fuzzy matching', () => {
        expect(normalizePartnerName('  PT   Contoh ')).toBe('pt contoh');
        expect(normalizePartnerName('PT Contoh Abadi')).not.toBe(
            normalizePartnerName('PT Contoh'),
        );
    });

    it('derives paid, partial, unpaid, and overdue status', () => {
        const past = new Date('2026-01-01T00:00:00.000Z');
        const now = new Date('2026-09-09T00:00:00.000Z');
        expect(statusForRemainingBalance(toMoneyDecimal(0, 'x', true), toMoneyDecimal(10, 'x'), null, now)).toBe('PAID');
        expect(statusForRemainingBalance(toMoneyDecimal(10, 'x'), toMoneyDecimal(5, 'x'), null, now)).toBe('PARTIAL');
        expect(statusForRemainingBalance(toMoneyDecimal(10, 'x'), toMoneyDecimal(0, 'x', true), null, now)).toBe('UNPAID');
        expect(statusForRemainingBalance(toMoneyDecimal(10, 'x'), toMoneyDecimal(5, 'x'), past, now)).toBe('OVERDUE');
    });
});
