
import { describe, it, expect } from 'vitest';
import { computeMaterialTotals } from '../production-utils';

describe('computeMaterialTotals', () => {
    it('returns zeros when inputs are empty', () => {
        const res = computeMaterialTotals([], []);
        expect(res.plannedTotal).toBe(0);
        expect(res.issuedTotal).toBe(0);
        expect(res.issuedPct).toBe(0);
    });

    it('calculates totals and percentage correctly', () => {
        const planned = [{ quantity: 100 }, { quantity: '50' }];
        const issues = [{ quantity: 30 }, { quantity: '20' }];

        const res = computeMaterialTotals(planned, issues);

        expect(res.plannedTotal).toBe(150);
        expect(res.issuedTotal).toBe(50);
        expect(res.issuedPct).toBeCloseTo((50 / 150) * 100);
    });

    it('handles undefined inputs', () => {
        const res = computeMaterialTotals(undefined, undefined);
        expect(res.plannedTotal).toBe(0);
        expect(res.issuedTotal).toBe(0);
        expect(res.issuedPct).toBe(0);
    });
});
