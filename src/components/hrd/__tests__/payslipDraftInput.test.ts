import { describe, it, expect } from 'vitest';
import { parseDraftAmounts } from '../payslipDraftInput';

const VALID = {
    thrAmount: '0',
    prorationDeduction: '25000',
    bpjsDeduction: '100000.5',
    loanDeduction: '0',
    otherDeductions: '0',
};

describe('parseDraftAmounts', () => {
    it('returns numeric values for valid input', () => {
        const res = parseDraftAmounts(VALID);

        expect(res).toEqual({
            ok: true,
            values: {
                thrAmount: 0,
                prorationDeduction: 25000,
                bpjsDeduction: 100000.5,
                loanDeduction: 0,
                otherDeductions: 0,
            },
        });
    });

    it('rejects non-numeric text instead of turning it into 0', () => {
        const res = parseDraftAmounts({ ...VALID, loanDeduction: 'abc' });

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.errors.loanDeduction).toMatch(/angka/i);
    });

    it('rejects an empty field', () => {
        const res = parseDraftAmounts({ ...VALID, bpjsDeduction: '  ' });

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.errors.bpjsDeduction).toBeTruthy();
    });

    it('rejects negative values', () => {
        const res = parseDraftAmounts({ ...VALID, thrAmount: '-1' });

        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.errors.thrAmount).toMatch(/negatif/i);
    });

    it('rejects Infinity', () => {
        const res = parseDraftAmounts({ ...VALID, otherDeductions: 'Infinity' });

        expect(res.ok).toBe(false);
    });

    it('reports every invalid field at once', () => {
        const res = parseDraftAmounts({
            ...VALID,
            thrAmount: 'x',
            loanDeduction: '-5',
        });

        expect(res.ok).toBe(false);
        if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(['loanDeduction', 'thrAmount']);
    });
});
