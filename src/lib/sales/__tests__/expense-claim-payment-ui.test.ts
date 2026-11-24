import { describe, expect, it } from 'vitest';
import {
    accountLabel,
    buildPayInput,
    emptyPayDraft,
    validatePayDraft,
    type PayDraft,
} from '../expense-claim-payment-ui';

// 24 Nov 2026 12:00 WIB
const NOW = new Date('2026-11-24T05:00:00.000Z');

function draft(overrides: Partial<PayDraft> = {}): PayDraft {
    return {
        expenseAccountId: 'acc-expense',
        paymentAccountId: 'acc-cash',
        paymentDate: '2026-11-24',
        ...overrides,
    };
}

describe('emptyPayDraft', () => {
    it('defaults the payment date to today in WIB with no accounts chosen', () => {
        // 23:30 UTC on 24 Nov is already 25 Nov in WIB
        const result = emptyPayDraft(new Date('2026-11-24T23:30:00.000Z'));

        expect(result).toEqual({
            expenseAccountId: '',
            paymentAccountId: '',
            paymentDate: '2026-11-25',
        });
    });
});

describe('validatePayDraft', () => {
    it('accepts a complete draft dated today', () => {
        expect(validatePayDraft(draft(), NOW)).toBeNull();
    });

    it('requires an expense account first, then a source account', () => {
        expect(validatePayDraft(draft({ expenseAccountId: '' }), NOW)).toBe(
            'Pilih akun biaya',
        );
        expect(validatePayDraft(draft({ paymentAccountId: '' }), NOW)).toBe(
            'Pilih akun sumber dana',
        );
    });

    it('rejects the same account on both sides', () => {
        expect(
            validatePayDraft(draft({ paymentAccountId: 'acc-expense' }), NOW),
        ).toBe('Akun biaya dan akun sumber dana harus berbeda');
    });

    it('rejects a missing, malformed or impossible date', () => {
        expect(validatePayDraft(draft({ paymentDate: '' }), NOW)).toBe(
            'Tanggal pembayaran wajib diisi',
        );
        expect(validatePayDraft(draft({ paymentDate: '24/11/2026' }), NOW)).toBe(
            'Tanggal pembayaran wajib diisi',
        );
        expect(validatePayDraft(draft({ paymentDate: '2026-02-31' }), NOW)).toBe(
            'Tanggal pembayaran wajib diisi',
        );
    });

    it('rejects a date after today in WIB but accepts earlier days', () => {
        expect(validatePayDraft(draft({ paymentDate: '2026-11-25' }), NOW)).toBe(
            'Tanggal pembayaran tidak boleh di masa depan',
        );
        expect(
            validatePayDraft(draft({ paymentDate: '2026-11-01' }), NOW),
        ).toBeNull();
    });
});

describe('buildPayInput', () => {
    it('sends only the claim id, the two accounts and the date', () => {
        const payload = buildPayInput('claim-1', {
            ...draft(),
            extra: 'ignored',
        } as PayDraft);

        expect(payload).toEqual({
            claimId: 'claim-1',
            expenseAccountId: 'acc-expense',
            paymentAccountId: 'acc-cash',
            paymentDate: '2026-11-24',
        });
    });
});

describe('accountLabel', () => {
    it('shows code and name', () => {
        expect(accountLabel({ id: '1', code: '11110', name: 'Kas Kecil' })).toBe(
            '11110 · Kas Kecil',
        );
    });
});
