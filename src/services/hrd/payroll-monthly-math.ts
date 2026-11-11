/**
 * Pure payroll helpers (no DB): day counting, loan deduction rules, payslip amounts.
 */

import type { Prisma } from '@prisma/client';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Count Mon–Sat days in [start, end] inclusive (UTC). Sundays excluded. */
export function countMonToSat(start: Date, end: Date): number {
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
        const day = d.getUTCDay(); // 0=Sun
        if (day !== 0) count++;
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return count;
}

/** Year-month as YYYYMM number for comparison. */
export function yearMonthKey(year: number, month: number): number {
    return year * 100 + month;
}

function dateToYearMonth(date: Date): { year: number; month: number } {
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

/**
 * FULL_NEXT_MONTH is only deductible starting the calendar month *after* the loan date.
 * INSTALLMENT is deductible in any open payroll once ACTIVE.
 */
export function isLoanDeductibleInPeriod(
    loan: { repaymentType: 'INSTALLMENT' | 'FULL_NEXT_MONTH'; date: Date },
    periodYear: number,
    periodMonth: number,
): boolean {
    if (loan.repaymentType === 'INSTALLMENT') return true;
    const { year, month } = dateToYearMonth(new Date(loan.date));
    return yearMonthKey(periodYear, periodMonth) > yearMonthKey(year, month);
}

export function nextDeductionAmount(
    loan: {
        repaymentType: 'INSTALLMENT' | 'FULL_NEXT_MONTH';
        installmentAmount: Prisma.Decimal | number | null;
        remainingBalance: Prisma.Decimal | number;
        date?: Date;
    },
    periodYear?: number,
    periodMonth?: number,
): number {
    if (
        loan.repaymentType === 'FULL_NEXT_MONTH' &&
        loan.date &&
        periodYear != null &&
        periodMonth != null &&
        !isLoanDeductibleInPeriod(
            { repaymentType: loan.repaymentType, date: loan.date },
            periodYear,
            periodMonth,
        )
    ) {
        return 0;
    }
    const remaining = Number(loan.remainingBalance);
    if (remaining <= 0) return 0;
    if (loan.repaymentType === 'FULL_NEXT_MONTH') return remaining;
    const inst = Number(loan.installmentAmount ?? 0);
    if (inst <= 0) return 0;
    return Math.min(inst, remaining);
}

export interface ComputePayslipInput {
    baseSalary: number;
    allowanceTotal: number;
    thrAmount: number;
    prorationDeduction: number;
    bpjsDeduction: number;
    loanDeduction: number;
    otherDeductions: number;
}

/**
 * Plan §4:
 *   grossPay = base + allowance + thr
 *   deductionTotal = bpjs + loan + other + proration
 *   netPay = gross − deductions
 */
export function computePayslipAmounts(input: ComputePayslipInput) {
    const baseSalary = round2(Math.max(0, input.baseSalary));
    const allowanceTotal = round2(Math.max(0, input.allowanceTotal));
    const thrAmount = round2(Math.max(0, input.thrAmount));
    const prorationDeduction = round2(Math.max(0, input.prorationDeduction));
    const bpjsDeduction = round2(Math.max(0, input.bpjsDeduction));
    const loanDeduction = round2(Math.max(0, input.loanDeduction));
    const otherDeductions = round2(Math.max(0, input.otherDeductions));

    const grossPay = round2(baseSalary + allowanceTotal + thrAmount);
    const deductionTotal = round2(
        bpjsDeduction + loanDeduction + otherDeductions + prorationDeduction,
    );
    const netPay = round2(grossPay - deductionTotal);

    return {
        baseSalary,
        allowanceTotal,
        thrAmount,
        prorationDeduction,
        bpjsDeduction,
        loanDeduction,
        otherDeductions,
        grossPay,
        deductionTotal,
        netPay,
    };
}

export type DeductibleLoan = Parameters<typeof nextDeductionAmount>[0];

/** Total a payslip of (year, month) may deduct from these loans. */
export function sumLoanDeductions(
    loans: DeductibleLoan[],
    year: number,
    month: number,
): number {
    return round2(
        loans.reduce((s, l) => s + nextDeductionAmount(l, year, month), 0),
    );
}
