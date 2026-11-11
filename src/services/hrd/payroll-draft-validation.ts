/**
 * Validation for manual DRAFT payslip edits.
 */

import type { PrismaClient } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { round2, sumLoanDeductions } from './payroll-monthly-math';

export interface UpdateDraftPayslipInput {
    thrAmount?: number;
    prorationDeduction?: number;
    bpjsDeduction?: number;
    loanDeduction?: number;
    otherDeductions?: number;
    notes?: string | null;
}

const DRAFT_PATCH_FIELD_LABELS = {
    thrAmount: 'THR',
    prorationDeduction: 'Potongan prorata',
    bpjsDeduction: 'Potongan BPJS',
    loanDeduction: 'Potongan kasbon',
    otherDeductions: 'Potongan lainnya',
} as const;

/** Reject (never clamp) non-finite or negative amounts so a typo cannot silently become 0. */
export function assertValidDraftPatch(patch: UpdateDraftPayslipInput): void {
    for (const field of Object.keys(DRAFT_PATCH_FIELD_LABELS) as Array<
        keyof typeof DRAFT_PATCH_FIELD_LABELS
    >) {
        const value = patch[field];
        if (value === undefined) continue;
        if (!Number.isFinite(value) || value < 0) {
            throw new BusinessRuleError(
                `${DRAFT_PATCH_FIELD_LABELS[field]} harus berupa angka tidak negatif`,
            );
        }
    }
}

/** loanDeduction may not exceed what the employee's ACTIVE loans entitle for the slip's period. */
export async function assertLoanDeductionAllowed(
    db: PrismaClient,
    payslip: {
        employeeId: string;
        payrollPeriod: { year: number; month: number };
    },
    requested: number,
): Promise<void> {
    if (requested <= 0) return;
    const loans = await db.employeeLoan.findMany({
        where: { employeeId: payslip.employeeId, status: 'ACTIVE' },
    });
    const entitled = sumLoanDeductions(
        loans,
        payslip.payrollPeriod.year,
        payslip.payrollPeriod.month,
    );
    if (round2(requested) > entitled) {
        throw new BusinessRuleError(
            `Potongan kasbon (${round2(requested)}) melebihi jumlah yang berhak dipotong periode ini (${entitled})`,
        );
    }
}
