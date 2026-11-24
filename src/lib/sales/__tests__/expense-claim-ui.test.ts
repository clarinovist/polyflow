import { describe, expect, it } from 'vitest';
import {
    CATEGORY_OPTIONS,
    buildSubmitInput,
    canCancelClaim,
    categoryLabel,
    claimDateBounds,
    formatAmountInput,
    parseAmountDigits,
    sanitizeAmountInput,
    statusMeta,
    todayWib,
    validateClaimDraft,
    type ClaimDraft,
} from '../expense-claim-ui';

const NOW = new Date('2026-11-24T05:00:00.000Z'); // 24 Nov 2026, 12:00 WIB

const validDraft: ClaimDraft = {
    receiptUrl: '/api/images/tenant/expense-receipt/user/1700000000000.jpg',
    category: 'BBM',
    amountDigits: '125000',
    expenseDate: '2026-11-24',
    description: '  Bensin kunjungan  ',
};

describe('category and status labels', () => {
    it('lists every category with its Indonesian label', () => {
        expect(CATEGORY_OPTIONS.map((o) => o.label)).toEqual([
            'BBM',
            'Parkir',
            'Tol',
            'Makan',
            'Transport lain',
            'Lainnya',
        ]);
    });

    it('falls back to the raw value for an unknown category or status', () => {
        expect(categoryLabel('PARKIR')).toBe('Parkir');
        expect(categoryLabel('ASING')).toBe('ASING');
        expect(statusMeta('ASING').label).toBe('ASING');
    });

    it.each([
        ['SUBMITTED', 'Menunggu'],
        ['APPROVED', 'Disetujui'],
        ['REJECTED', 'Ditolak'],
        ['PAID', 'Dibayar'],
        ['CANCELLED', 'Dibatalkan'],
    ])('labels %s as %s', (status, label) => {
        expect(statusMeta(status).label).toBe(label);
    });

    it('allows cancelling only SUBMITTED claims', () => {
        expect(canCancelClaim('SUBMITTED')).toBe(true);
        for (const status of ['APPROVED', 'REJECTED', 'PAID', 'CANCELLED']) {
            expect(canCancelClaim(status)).toBe(false);
        }
    });
});

describe('amount input helpers', () => {
    it('keeps digits only and drops leading zeros', () => {
        expect(sanitizeAmountInput('Rp 0012.500,50')).toBe('1250050');
        expect(sanitizeAmountInput('abc')).toBe('');
    });

    it('caps the length at the column capacity', () => {
        expect(sanitizeAmountInput('9'.repeat(20))).toHaveLength(13);
    });

    it('groups thousands with dots for display', () => {
        expect(formatAmountInput('1250000')).toBe('1.250.000');
        expect(formatAmountInput('999')).toBe('999');
        expect(formatAmountInput('')).toBe('');
    });

    it('parses positive whole amounts and rejects empty input', () => {
        expect(parseAmountDigits('125000')).toBe(125000);
        expect(parseAmountDigits('')).toBeNull();
        expect(parseAmountDigits('0')).toBeNull();
    });
});

describe('claim date bounds (WIB)', () => {
    it('uses the WIB calendar day, not the UTC day', () => {
        const justAfterWibMidnight = new Date('2026-11-23T18:00:00.000Z');
        expect(todayWib(justAfterWibMidnight)).toBe('2026-11-24');
    });

    it('allows today back to 90 days ago', () => {
        expect(claimDateBounds(NOW)).toEqual({
            min: '2026-08-26',
            max: '2026-11-24',
        });
    });
});

describe('validateClaimDraft', () => {
    it('accepts a complete draft', () => {
        expect(validateClaimDraft(validDraft, NOW)).toBeNull();
    });

    it('requires the receipt photo first', () => {
        expect(
            validateClaimDraft({ ...validDraft, receiptUrl: null }, NOW),
        ).toBe('Foto nota wajib diunggah');
    });

    it('requires a category', () => {
        expect(validateClaimDraft({ ...validDraft, category: '' }, NOW)).toBe(
            'Pilih kategori pengeluaran',
        );
    });

    it('requires an amount above zero', () => {
        expect(
            validateClaimDraft({ ...validDraft, amountDigits: '' }, NOW),
        ).toBe('Nominal harus lebih dari nol');
    });

    it('rejects a missing or malformed date', () => {
        expect(validateClaimDraft({ ...validDraft, expenseDate: '' }, NOW)).toBe(
            'Tanggal pengeluaran wajib diisi',
        );
    });

    it('rejects a future date', () => {
        expect(
            validateClaimDraft({ ...validDraft, expenseDate: '2026-11-25' }, NOW),
        ).toBe('Tanggal pengeluaran tidak boleh di masa depan');
    });

    it('accepts the oldest allowed day and rejects the day before it', () => {
        expect(
            validateClaimDraft({ ...validDraft, expenseDate: '2026-08-26' }, NOW),
        ).toBeNull();
        expect(
            validateClaimDraft({ ...validDraft, expenseDate: '2026-08-25' }, NOW),
        ).toBe('Nota lebih lama dari 90 hari tidak dapat diklaim');
    });

    it('requires a non-blank description within the limit', () => {
        expect(
            validateClaimDraft({ ...validDraft, description: '   ' }, NOW),
        ).toBe('Keterangan wajib diisi');
        expect(
            validateClaimDraft(
                { ...validDraft, description: 'a'.repeat(501) },
                NOW,
            ),
        ).toBe('Keterangan maksimal 500 karakter');
    });
});

describe('buildSubmitInput', () => {
    it('builds the submit payload with a trimmed description and the claim id', () => {
        expect(
            buildSubmitInput(validDraft, { clientClaimId: 'claim-1' }),
        ).toEqual({
            expenseDate: '2026-11-24',
            category: 'BBM',
            amount: 125000,
            description: 'Bensin kunjungan',
            receiptUrl: validDraft.receiptUrl,
            clientClaimId: 'claim-1',
        });
    });

    it('attaches the visit id only when present', () => {
        const withVisit = buildSubmitInput(validDraft, {
            clientClaimId: 'claim-1',
            salesVisitId: 'visit-9',
        });
        expect(withVisit.salesVisitId).toBe('visit-9');
        expect(
            'salesVisitId' in
                buildSubmitInput(validDraft, { clientClaimId: 'claim-1' }),
        ).toBe(false);
    });

    it('throws for an incomplete draft instead of sending bad data', () => {
        expect(() =>
            buildSubmitInput(
                { ...validDraft, receiptUrl: null },
                { clientClaimId: 'claim-1' },
            ),
        ).toThrow('Draf klaim belum lengkap');
    });
});
