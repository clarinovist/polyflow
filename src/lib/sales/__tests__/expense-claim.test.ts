import { describe, expect, it } from 'vitest';
import {
    CLAIM_LIST_DEFAULT_TAKE,
    CLAIM_LIST_MAX_TAKE,
    CLAIM_MAX_BACKDATE_DAYS,
    clampTake,
    listClaimsSchema,
    parseClaimInput,
    payClaimAccountsSchema,
    payClaimSchema,
    rejectClaimSchema,
    resolveExpenseDate,
    resolvePaymentDate,
    submitClaimSchema,
} from '../expense-claim';

// 2026-11-24 12:00 WIB
const NOW = new Date('2026-11-24T05:00:00Z');
const validInput = {
    expenseDate: '2026-11-24',
    category: 'BBM',
    amount: 50000,
    description: 'Bensin ke pelanggan',
    receiptUrl: '/api/images/t/expense-receipt/u/1.jpg',
};

describe('submitClaimSchema', () => {
    it('accepts a valid claim and trims the description', () => {
        const parsed = parseClaimInput(submitClaimSchema, {
            ...validInput,
            description: '  Bensin  ',
            salesVisitId: 'v1',
            clientClaimId: 'c1',
        });
        expect(parsed.description).toBe('Bensin');
        expect(parsed.salesVisitId).toBe('v1');
    });

    it.each([
        ['zero amount', { amount: 0 }, 'lebih dari nol'],
        ['negative amount', { amount: -5 }, 'lebih dari nol'],
        ['non-numeric amount', { amount: '5000' }, 'angka'],
        ['fractional cents', { amount: 10.005 }, 'dua angka desimal'],
        ['absurd amount', { amount: 1e15 }, 'terlalu besar'],
        ['unknown category', { category: 'ROKOK' }, 'Kategori'],
        ['blank description', { description: '   ' }, 'Keterangan wajib'],
        ['long description', { description: 'x'.repeat(501) }, 'maksimal 500'],
        ['missing receipt', { receiptUrl: '' }, 'Foto nota'],
        ['bad date format', { expenseDate: '24/11/2026' }, 'YYYY-MM-DD'],
    ])('rejects %s', (_label, patch, message) => {
        expect(() =>
            parseClaimInput(submitClaimSchema, { ...validInput, ...patch }),
        ).toThrow(message);
    });

    it('throws a ValidationError for non-object input', () => {
        expect(() => parseClaimInput(submitClaimSchema, null)).toThrow();
    });
});

describe('rejectClaimSchema / payClaimSchema / listClaimsSchema', () => {
    it('requires a trimmed reason of 3-300 characters', () => {
        expect(parseClaimInput(rejectClaimSchema, { claimId: 'c', reason: ' ok! ' }).reason).toBe('ok!');
        expect(() => parseClaimInput(rejectClaimSchema, { claimId: 'c', reason: '  ' })).toThrow('minimal 3');
        expect(() => parseClaimInput(rejectClaimSchema, { claimId: 'c', reason: 'ab' })).toThrow('minimal 3');
        expect(() => parseClaimInput(rejectClaimSchema, { claimId: 'c', reason: 'x'.repeat(301) })).toThrow('maksimal 300');
    });

    it('requires ids and an optional date-only payment date', () => {
        expect(parseClaimInput(payClaimSchema, { claimId: 'c', expenseAccountId: 'e', paymentAccountId: 'p' }).claimId).toBe('c');
        expect(() => parseClaimInput(payClaimAccountsSchema, { expenseAccountId: '', paymentAccountId: 'p' })).toThrow();
        expect(() => parseClaimInput(payClaimAccountsSchema, { expenseAccountId: 'e', paymentAccountId: 'p', paymentDate: 'besok' })).toThrow('YYYY-MM-DD');
    });

    it('accepts missing list options and rejects an unknown status', () => {
        expect(parseClaimInput(listClaimsSchema, undefined)).toBeUndefined();
        expect(parseClaimInput(listClaimsSchema, { status: 'PAID', take: 10 })).toEqual({ status: 'PAID', take: 10 });
        expect(() => parseClaimInput(listClaimsSchema, { status: 'NOPE' })).toThrow('Status');
    });
});

describe('clampTake', () => {
    it('defaults, truncates and clamps', () => {
        expect(clampTake(undefined)).toBe(CLAIM_LIST_DEFAULT_TAKE);
        expect(clampTake(Number.NaN)).toBe(CLAIM_LIST_DEFAULT_TAKE);
        expect(clampTake(0)).toBe(1);
        expect(clampTake(7.9)).toBe(7);
        expect(clampTake(10_000)).toBe(CLAIM_LIST_MAX_TAKE);
    });
});

describe('resolveExpenseDate', () => {
    it('returns WIB midnight for today and for the oldest allowed day', () => {
        expect(resolveExpenseDate('2026-11-24', NOW).toISOString()).toBe('2026-11-23T17:00:00.000Z');
        expect(CLAIM_MAX_BACKDATE_DAYS).toBe(90);
        expect(resolveExpenseDate('2026-08-26', NOW).toISOString()).toBe('2026-08-25T17:00:00.000Z');
    });

    it('treats "today" by the WIB calendar, not UTC', () => {
        const lateUtc = new Date('2026-11-24T20:00:00Z'); // already 25 Nov in WIB
        expect(() => resolveExpenseDate('2026-11-25', lateUtc)).not.toThrow();
    });

    it('rejects a future date', () => {
        expect(() => resolveExpenseDate('2026-11-25', NOW)).toThrow('masa depan');
    });

    it('rejects a date older than 90 days', () => {
        expect(() => resolveExpenseDate('2026-08-25', NOW)).toThrow('90 hari');
    });

    it('rejects an impossible calendar day', () => {
        expect(() => resolveExpenseDate('2026-02-30', NOW)).toThrow('tidak valid');
    });
});

describe('resolvePaymentDate', () => {
    it('defaults to today (WIB midnight)', () => {
        expect(resolvePaymentDate(undefined, NOW).toISOString()).toBe('2026-11-23T17:00:00.000Z');
    });

    it('accepts today or earlier, rejects the future and garbage', () => {
        expect(resolvePaymentDate('2026-11-01', NOW).toISOString()).toBe('2026-10-31T17:00:00.000Z');
        expect(() => resolvePaymentDate('2026-11-25', NOW)).toThrow('masa depan');
        expect(() => resolvePaymentDate('2026-13-01', NOW)).toThrow('tidak valid');
    });
});
