import { describe, it, expect } from 'vitest';
import { evaluateBomMassBalance } from '../bom-form-validation';

describe('evaluateBomMassBalance', () => {
    it('skips mass conservation check for non-KG output (e.g. 1 KARTON with mixed inputs)', () => {
        const result = evaluateBomMassBalance({
            outputQuantity: 1,
            outputUnit: 'KARTON',
            items: [
                { quantity: 7.5, unit: 'KG' },
                { quantity: 1, unit: 'PCS' },
                { quantity: 1.6, unit: 'KG' },
                { quantity: 0.3, unit: 'KG' },
            ],
        });

        expect(result.status).toBe('skip');
        if (result.status === 'skip') {
            expect(result.reason).toBe('non-kg-output');
        }
    });

    it('returns ok for 100 KG output with 98 KG + 2 KG + 1 PCS packaging (PCS is ignored)', () => {
        const result = evaluateBomMassBalance({
            outputQuantity: 100,
            outputUnit: 'KG',
            items: [
                { quantity: 98, unit: 'KG' },
                { quantity: 2, unit: 'KG' },
                { quantity: 1, unit: 'PCS' },
            ],
        });

        expect(result.status).toBe('ok');
        if (result.status === 'ok') {
            expect(result.totalInputKg).toBe(100);
            expect(result.outputKg).toBe(100);
        }
    });

    it('returns output-exceeds-input warning when 100 KG output has only 90 KG input', () => {
        const result = evaluateBomMassBalance({
            outputQuantity: 100,
            outputUnit: 'KG',
            items: [{ quantity: 90, unit: 'KG' }],
        });

        expect(result.status).toBe('output-exceeds-input');
        if (result.status === 'output-exceeds-input') {
            expect(result.totalInputKg).toBe(90);
            expect(result.outputKg).toBe(100);
        }
    });

    it('returns high-shrinkage warning based on 130 KG input (ignoring 1 PCS), not 131', () => {
        const result = evaluateBomMassBalance({
            outputQuantity: 100,
            outputUnit: 'KG',
            items: [
                { quantity: 130, unit: 'KG' },
                { quantity: 1, unit: 'PCS' },
            ],
        });

        expect(result.status).toBe('high-shrinkage');
        if (result.status === 'high-shrinkage') {
            expect(result.totalInputKg).toBe(130);
            expect(result.outputKg).toBe(100);
            expect(result.shrinkagePercent).toBeCloseTo(23.0769, 3);
        }
    });

    it('skips mass conservation check when output is KG but no KG ingredients exist', () => {
        const result = evaluateBomMassBalance({
            outputQuantity: 10,
            outputUnit: 'KG',
            items: [{ quantity: 100, unit: 'PCS' }],
        });

        expect(result.status).toBe('skip');
        if (result.status === 'skip') {
            expect(result.reason).toBe('no-kg-ingredients');
        }
    });

    it('handles case-insensitive unit matching (e.g. kg, Kg, KG)', () => {
        const result = evaluateBomMassBalance({
            outputQuantity: 10,
            outputUnit: 'kg',
            items: [{ quantity: 10, unit: 'Kg' }],
        });

        expect(result.status).toBe('ok');
        if (result.status === 'ok') {
            expect(result.totalInputKg).toBe(10);
            expect(result.outputKg).toBe(10);
        }
    });
});
