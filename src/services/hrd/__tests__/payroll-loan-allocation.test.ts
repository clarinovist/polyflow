import { describe, it, expect } from 'vitest';
import { allocateLoanDeduction } from '../payroll-loan-allocation';

const sum = (allocs: { amount: number }[]) =>
    Math.round(allocs.reduce((s, a) => s + a.amount * 100, 0));

describe('allocateLoanDeduction', () => {
    it('allocates the whole deduction to a single loan', () => {
        const r = allocateLoanDeduction(
            [{ id: 'a', remainingBalance: 500_000 }],
            200_000,
        );
        expect(r.allocations).toEqual([{ loanId: 'a', amount: 200_000 }]);
        expect(r.shortfall).toBe(0);
    });

    it('splits proportionally to remaining balance', () => {
        const r = allocateLoanDeduction(
            [
                { id: 'a', remainingBalance: 300_000 },
                { id: 'b', remainingBalance: 700_000 },
            ],
            100_000,
        );
        expect(r.allocations).toEqual([
            { loanId: 'a', amount: 30_000 },
            { loanId: 'b', amount: 70_000 },
        ]);
        expect(r.shortfall).toBe(0);
    });

    it('allocation total equals the deduction exactly despite rounding', () => {
        const loans = [
            { id: 'a', remainingBalance: 100.01 },
            { id: 'b', remainingBalance: 100.01 },
            { id: 'c', remainingBalance: 100.01 },
        ];
        const r = allocateLoanDeduction(loans, 100);
        expect(sum(r.allocations)).toBe(10_000);
        expect(r.shortfall).toBe(0);
    });

    it('never allocates more than a loan remaining balance', () => {
        const r = allocateLoanDeduction(
            [
                { id: 'a', remainingBalance: 0.01 },
                { id: 'b', remainingBalance: 1_000 },
            ],
            500,
        );
        for (const a of r.allocations) {
            const bal = a.loanId === 'a' ? 0.01 : 1_000;
            expect(a.amount).toBeLessThanOrEqual(bal);
        }
        expect(sum(r.allocations)).toBe(50_000);
    });

    it('pushes rounding remainder to the last loan that still has room', () => {
        // shares floor to 1c (a) and 0c (b); the leftover cent goes to b (last with room)
        const r = allocateLoanDeduction(
            [
                { id: 'a', remainingBalance: 0.02 },
                { id: 'b', remainingBalance: 0.01 },
            ],
            0.02,
        );
        expect(r.allocations).toEqual([
            { loanId: 'a', amount: 0.01 },
            { loanId: 'b', amount: 0.01 },
        ]);
        expect(r.shortfall).toBe(0);
    });

    it('reports shortfall when deduction exceeds total remaining', () => {
        const r = allocateLoanDeduction(
            [{ id: 'a', remainingBalance: 100_000 }],
            150_000,
        );
        expect(r.allocations).toEqual([{ loanId: 'a', amount: 100_000 }]);
        expect(r.shortfall).toBe(50_000);
    });

    it('reports the full deduction as shortfall when there are no loans', () => {
        const r = allocateLoanDeduction([], 75_000);
        expect(r.allocations).toEqual([]);
        expect(r.shortfall).toBe(75_000);
    });

    it('ignores loans with zero balance', () => {
        const r = allocateLoanDeduction(
            [
                { id: 'a', remainingBalance: 0 },
                { id: 'b', remainingBalance: 50_000 },
            ],
            20_000,
        );
        expect(r.allocations).toEqual([{ loanId: 'b', amount: 20_000 }]);
    });

    it('returns nothing for zero, negative or non-finite deduction', () => {
        const loans = [{ id: 'a', remainingBalance: 100_000 }];
        for (const d of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(allocateLoanDeduction(loans, d)).toEqual({
                allocations: [],
                shortfall: 0,
            });
        }
    });

    it('handles large balances without precision loss', () => {
        const r = allocateLoanDeduction(
            [
                { id: 'a', remainingBalance: 9_999_999_999.99 },
                { id: 'b', remainingBalance: 9_999_999_999.98 },
            ],
            12_345_678_901.23,
        );
        expect(sum(r.allocations)).toBe(1_234_567_890_123);
        expect(r.shortfall).toBe(0);
    });
});
