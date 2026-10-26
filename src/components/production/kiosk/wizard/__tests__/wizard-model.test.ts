import { describe, expect, it } from 'vitest';
import {
    affalProblem,
    hasilProblem,
    kirimProblem,
    parseAmount,
    qcProblem,
    wizardSteps,
} from '../wizard-model';

describe('wizardSteps', () => {
    it('adds Kemasan only for packaged output and QC only when the variant has parameters', () => {
        expect(wizardSteps({ actualPackagingEnabled: false, scrapOnly: false, hasQc: false })).toEqual(['hasil', 'affal', 'kirim']);
        expect(wizardSteps({ actualPackagingEnabled: true, scrapOnly: false, hasQc: true })).toEqual(['hasil', 'packaging', 'affal', 'qc', 'kirim']);
    });

    it('skips Kemasan when only affal is recorded: no output, no packaging', () => {
        expect(wizardSteps({ actualPackagingEnabled: true, scrapOnly: true, hasQc: false })).toEqual(['hasil', 'affal', 'kirim']);
    });
});

describe('parseAmount', () => {
    it('reads the Indonesian decimal comma and treats empty as zero', () => {
        expect(parseAmount('24,7')).toBe(24.7);
        expect(parseAmount('0.8')).toBe(0.8);
        expect(parseAmount('')).toBe(0);
        expect(parseAmount('abc')).toBeNaN();
    });
});

describe('hasilProblem', () => {
    it('asks for an output or an explicit affal-only choice', () => {
        expect(hasilProblem({ qty: 0, scrapOnly: false, conversionInvalid: false })).toMatch(/Hasil 0, hanya affal/);
        expect(hasilProblem({ qty: 0, scrapOnly: true, conversionInvalid: false })).toBeNull();
        expect(hasilProblem({ qty: Number.NaN, scrapOnly: false, conversionInvalid: false })).toMatch(/tidak valid/);
        expect(hasilProblem({ qty: -1, scrapOnly: false, conversionInvalid: false })).toMatch(/tidak valid/);
    });

    it('blocks a material conversion whose BOM ratio is ambiguous', () => {
        expect(hasilProblem({ qty: 5, scrapOnly: false, conversionInvalid: true })).toMatch(/BOM tidak valid/);
    });
});

describe('affalProblem', () => {
    it('needs affal, or the explicit no-affal choice, after a good output', () => {
        expect(affalProblem({ prongkol: 0, daun: 0, scrapOnly: false, noAffal: false })).toMatch(/Tidak ada affal/);
        expect(affalProblem({ prongkol: 0, daun: 0, scrapOnly: false, noAffal: true })).toBeNull();
        expect(affalProblem({ prongkol: 0.4, daun: 0, scrapOnly: false, noAffal: false })).toBeNull();
    });

    it('requires affal when the output is zero, so nothing empty is ever sent', () => {
        expect(affalProblem({ prongkol: 0, daun: 0, scrapOnly: true, noAffal: true })).toMatch(/wajib/);
        expect(affalProblem({ prongkol: -1, daun: 0, scrapOnly: false, noAffal: false })).toMatch(/tidak valid/);
    });
});

describe('qcProblem', () => {
    it('needs every parameter filled with a number', () => {
        const params = [{ id: 'width' }, { id: 'weight' }];
        expect(qcProblem(params, { width: '2.1' })).toMatch(/QC/);
        expect(qcProblem(params, { width: '2.1', weight: 'x' })).toMatch(/QC/);
        expect(qcProblem(params, { width: '2.1', weight: '0,9' })).toBeNull();
    });
});

describe('kirimProblem', () => {
    it('requires a chosen shift outside generic mode or when no shift is active now', () => {
        expect(kirimProblem({ mode: 'GENERIC', hasActiveShift: true, shiftId: '' })).toBeNull();
        expect(kirimProblem({ mode: 'GENERIC', hasActiveShift: false, shiftId: '' })).toMatch(/Shift wajib/);
        expect(kirimProblem({ mode: 'INDIVIDUAL_OUTPUT', hasActiveShift: true, shiftId: '' })).toMatch(/Shift wajib/);
        expect(kirimProblem({ mode: 'INDIVIDUAL_OUTPUT', hasActiveShift: true, shiftId: 'shift-1' })).toBeNull();
    });
});
