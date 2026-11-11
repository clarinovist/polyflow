/**
 * Transaction-scoped loan writes for payroll (finalize / unfinalize).
 * Every function takes the interactive-transaction client; none opens its own
 * transaction. Balance changes use atomic increment/decrement with a guard so a
 * concurrent writer can never be overwritten by a value computed from a stale read.
 */

import type { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import {
    allocateLoanDeduction,
    type LoanAllocation,
} from './payroll-loan-allocation';

type TxClient = Prisma.TransactionClient;

export const LOAN_DEDUCTION_EXCEEDS_BALANCE_MESSAGE =
    'Potongan kasbon melebihi sisa kasbon aktif; perbarui draft';

export interface PayslipLoanSource {
    id: string;
    loanDeduction: Prisma.Decimal | number;
    employee: {
        loans: Array<{
            id: string;
            loanNumber: string;
            remainingBalance: Prisma.Decimal | number;
        }>;
    };
}

export interface AppliedAllocation extends LoanAllocation {
    loanNumber: string;
}

/**
 * Split the payslip loanDeduction over its ACTIVE loans. The total must equal
 * loanDeduction exactly; otherwise the whole finalize must fail (no partial payment).
 */
export function planLoanAllocations(
    payslip: PayslipLoanSource,
): AppliedAllocation[] {
    const { allocations, shortfall } = allocateLoanDeduction(
        payslip.employee.loans.map((l) => ({
            id: l.id,
            remainingBalance: Number(l.remainingBalance),
        })),
        Number(payslip.loanDeduction),
    );
    if (shortfall > 0) {
        throw new BusinessRuleError(LOAN_DEDUCTION_EXCEEDS_BALANCE_MESSAGE);
    }
    const numberById = new Map(
        payslip.employee.loans.map((l) => [l.id, l.loanNumber]),
    );
    return allocations.map((a) => ({
        ...a,
        loanNumber: numberById.get(a.loanId) ?? '',
    }));
}

/** Mark PAID_OFF atomically, only if the balance is actually settled. */
export async function settleLoanIfPaidOff(
    tx: TxClient,
    loanId: string,
): Promise<void> {
    await tx.employeeLoan.updateMany({
        where: { id: loanId, status: 'ACTIVE', remainingBalance: { lte: 0 } },
        data: { status: 'PAID_OFF' },
    });
}

/** Decrement a loan (guarded, atomic), record the payment, settle if zero. */
export async function applyLoanAllocation(
    tx: TxClient,
    payslipId: string,
    allocation: LoanAllocation,
): Promise<void> {
    const claimed = await tx.employeeLoan.updateMany({
        where: {
            id: allocation.loanId,
            status: 'ACTIVE',
            remainingBalance: { gte: allocation.amount },
        },
        data: { remainingBalance: { decrement: allocation.amount } },
    });
    if (claimed.count !== 1) {
        throw new BusinessRuleError(LOAN_DEDUCTION_EXCEEDS_BALANCE_MESSAGE);
    }
    await tx.employeeLoanPayment.create({
        data: {
            loanId: allocation.loanId,
            payslipId,
            amount: allocation.amount,
            date: new Date(),
            notes: `Auto-deducted from payslip ${payslipId}`,
        },
    });
    await settleLoanIfPaidOff(tx, allocation.loanId);
}

export interface PaymentToReverse {
    id: string;
    amount: Prisma.Decimal | number;
    loan: { id: string };
}

/**
 * Give a payslip payment back to its loan: atomic increment, reactivate PAID_OFF
 * (DEFAULTED never matches the guard, so it stays DEFAULTED), delete the row.
 */
export async function reverseLoanPayment(
    tx: TxClient,
    payment: PaymentToReverse,
): Promise<void> {
    const amount = Number(payment.amount);
    await tx.employeeLoan.update({
        where: { id: payment.loan.id },
        data: { remainingBalance: { increment: amount } },
    });
    await tx.employeeLoan.updateMany({
        where: {
            id: payment.loan.id,
            status: 'PAID_OFF',
            remainingBalance: { gt: 0 },
        },
        data: { status: 'ACTIVE' },
    });
    await tx.employeeLoanPayment.delete({ where: { id: payment.id } });
}
