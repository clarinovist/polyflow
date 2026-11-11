/**
 * Pure helper: split a payslip loan deduction across ACTIVE loans.
 * All math in integer cents (columns are Decimal(12,2)) so the allocated
 * total matches the deduction exactly, never off by a float 0.01.
 */

export interface LoanBalance {
    id: string;
    remainingBalance: number;
}

export interface LoanAllocation {
    loanId: string;
    amount: number;
}

export interface AllocationResult {
    allocations: LoanAllocation[];
    /** Amount that could NOT be allocated (> 0 means the loans cannot cover it). */
    shortfall: number;
}

const CENTS_PER_UNIT = 100;

const toCents = (n: number): number => Math.round(n * CENTS_PER_UNIT);
const fromCents = (c: number): number => c / CENTS_PER_UNIT;
const sumOf = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);

/** floor(cap * amount / total) in BigInt to avoid float error on large balances. */
function proportionalShare(cap: number, amount: number, total: number): number {
    return Number((BigInt(cap) * BigInt(amount)) / BigInt(total));
}

/** Give the leftover cents to the last loans that still have room (never above cap). */
function distributeLeftover(
    shares: number[],
    caps: number[],
    leftover: number,
): number[] {
    const result = [...shares];
    let remaining = leftover;
    for (let i = result.length - 1; i >= 0 && remaining > 0; i--) {
        const add = Math.min(caps[i] - result[i], remaining);
        result[i] += add;
        remaining -= add;
    }
    return result;
}

export function allocateLoanDeduction(
    loans: LoanBalance[],
    deduction: number,
): AllocationResult {
    const target = toCents(deduction);
    if (!Number.isFinite(target) || target <= 0) {
        return { allocations: [], shortfall: 0 };
    }

    const open = loans
        .map((l) => ({ id: l.id, cap: toCents(l.remainingBalance) }))
        .filter((l) => l.cap > 0);
    const caps = open.map((l) => l.cap);
    const totalCap = sumOf(caps);
    // Allocatable never exceeds what the loans can absorb; the rest is shortfall.
    const allocatable = Math.min(target, totalCap);
    if (allocatable <= 0) {
        return { allocations: [], shortfall: fromCents(target) };
    }

    const shares = caps.map((cap) =>
        proportionalShare(cap, allocatable, totalCap),
    );
    const finalShares = distributeLeftover(
        shares,
        caps,
        allocatable - sumOf(shares),
    );

    const allocations = open
        .map((l, i) => ({ loanId: l.id, amount: fromCents(finalShares[i]) }))
        .filter((a) => a.amount > 0);

    return { allocations, shortfall: fromCents(target - allocatable) };
}
