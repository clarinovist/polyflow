'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { ValidationError, safeAction } from '@/lib/errors/errors';
import { requireHrdApprover, requireHrdFinance } from '@/lib/auth/hrd-access';
import { logActivity } from '@/lib/tools/audit';
import { serializeData } from '@/lib/utils/utils';
import type { Prisma } from '@prisma/client';
import {
    EmployeeAllowanceService,
    EmployeeLoanService,
    PayrollMonthlyService,
    type AllowanceInput,
    type CreateLoanInput,
    type GeneratePayslipsInput,
    type RecordLoanPaymentInput,
    type UpdateDraftPayslipInput,
} from '@/services/hrd/payroll-monthly-service';

// ─── Validasi batas server action ───

const MIN_MONTH = 1;
const MAX_MONTH = 12;

function toValidDate(value: unknown, label: string): Date {
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) {
        throw new ValidationError(`${label} tidak valid`);
    }
    return date;
}

function assertPositiveFinite(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new ValidationError(`${label} harus berupa angka lebih dari 0`);
    }
    return value;
}

function assertValidPeriod(input: GeneratePayslipsInput): void {
    const { year, month } = input;
    if (!Number.isInteger(year) || year <= 0) {
        throw new ValidationError('Tahun periode tidak valid');
    }
    if (!Number.isInteger(month) || month < MIN_MONTH || month > MAX_MONTH) {
        throw new ValidationError('Bulan periode harus antara 1 dan 12');
    }
}

function formatPeriod(year: number, month: number): string {
    return `${year}-${String(month).padStart(2, '0')}`;
}

// ─── Audit di dalam transaksi service (gagal audit = operasi batal) ───
// Detail audit hanya memakai `facts` dari service: tanpa query tambahan, dan
// fakta yang hilang/salah tipe melempar error agar transaksi batal (tidak ada
// audit separuh).

type Tx = Prisma.TransactionClient;
type Facts = Record<string, unknown>;

function missingFact(operation: string, key: string): ValidationError {
    return new ValidationError(
        `Audit ${operation} dibatalkan: data "${key}" dari service tidak valid`,
    );
}

function factString(facts: Facts, key: string, operation: string): string {
    const value = facts?.[key];
    if (typeof value !== 'string') throw missingFact(operation, key);
    return value;
}

function factNumber(facts: Facts, key: string, operation: string): number {
    const value = facts?.[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw missingFact(operation, key);
    }
    return value;
}

function factArray(facts: Facts, key: string, operation: string): unknown[] {
    const value = facts?.[key];
    if (!Array.isArray(value)) throw missingFact(operation, key);
    return value;
}

function auditFinalize(userId: string, payslipId: string) {
    return async (tx: Tx, facts: Facts): Promise<void> => {
        const op = 'finalize';
        const employeeId = factString(facts, 'employeeId', op);
        const netPay = factNumber(facts, 'netPay', op);
        const allocations = factArray(facts, 'allocations', op);
        await logActivity({
            userId,
            action: 'PAYSLIP_FINALIZED',
            entityType: 'Payslip',
            entityId: payslipId,
            details: `Finalized payslip for employee=${employeeId}, netPay=${netPay}; ${allocations.length} loan allocation(s)`,
            changes: { allocations },
            tx,
        });
    };
}

function auditUnfinalize(userId: string, payslipId: string) {
    return async (tx: Tx, facts: Facts): Promise<void> => {
        const op = 'unfinalize';
        const employeeId = factString(facts, 'employeeId', op);
        const reversedPayments = factArray(facts, 'reversedPayments', op);
        await logActivity({
            userId,
            action: 'PAYSLIP_UNFINALIZED',
            entityType: 'Payslip',
            entityId: payslipId,
            details: `Un-finalized payslip for employee=${employeeId}, reverted to DRAFT; ${reversedPayments.length} loan payment(s) reversed`,
            changes: { reversedPayments },
            tx,
        });
    };
}

function auditMarkPaid(userId: string, payslipId: string) {
    return async (tx: Tx, facts: Facts): Promise<void> => {
        const employeeId = factString(facts, 'employeeId', 'markPaid');
        await logActivity({
            userId,
            action: 'PAYSLIP_PAID',
            entityType: 'Payslip',
            entityId: payslipId,
            details: `Marked payslip PAID for employee=${employeeId}`,
            tx,
        });
    };
}

function auditLoanPayment(userId: string, loanId: string) {
    return async (tx: Tx, facts: Facts): Promise<void> => {
        const op = 'pembayaran kasbon';
        const amount = factNumber(facts, 'paymentAmount', op);
        const loanNumber = factString(facts, 'loanNumber', op);
        const code = factString(facts, 'employeeCode', op);
        const name = factString(facts, 'employeeName', op);
        const remaining = factNumber(facts, 'remainingBalance', op);
        const status = factString(facts, 'status', op);
        await logActivity({
            userId,
            action: 'LOAN_PAYMENT_RECORDED',
            entityType: 'EmployeeLoan',
            entityId: loanId,
            details: `Manual payment ${amount} on ${loanNumber} (${code} — ${name}); remaining=${remaining}, status=${status}`,
            tx,
        });
    };
}

function auditGenerate(userId: string) {
    return async (tx: Tx, facts: Facts): Promise<void> => {
        const op = 'generate payslip';
        const periodId = factString(facts, 'periodId', op);
        const year = factNumber(facts, 'year', op);
        const month = factNumber(facts, 'month', op);
        const created = factNumber(facts, 'created', op);
        const skipped = factNumber(facts, 'skipped', op);
        await logActivity({
            userId,
            action: 'PAYROLL_GENERATED',
            entityType: 'PayrollPeriod',
            entityId: periodId,
            details: `Generated ${created} payslips (${skipped} skipped) for ${formatPeriod(year, month)}`,
            tx,
        });
    };
}

function auditClosePeriod(userId: string, periodId: string) {
    return async (tx: Tx, facts: Facts): Promise<void> => {
        const op = 'tutup periode';
        const year = factNumber(facts, 'year', op);
        const month = factNumber(facts, 'month', op);
        await logActivity({
            userId,
            action: 'PAYROLL_PERIOD_CLOSED',
            entityType: 'PayrollPeriod',
            entityId: periodId,
            details: `Closed payroll period ${formatPeriod(year, month)}`,
            tx,
        });
    };
}

function auditRecomputeProration(userId: string, payslipId: string) {
    return async (tx: Tx, facts: Facts): Promise<void> => {
        const op = 'hitung ulang potongan absensi';
        const employeeId = factString(facts, 'employeeId', op);
        const absentDays = factNumber(facts, 'absentDays', op);
        const deductibleLeaveDays = factNumber(facts, 'deductibleLeaveDays', op);
        const previousProration = factNumber(facts, 'previousProration', op);
        const prorationDeduction = factNumber(facts, 'prorationDeduction', op);
        await logActivity({
            userId,
            action: 'PAYSLIP_PRORATION_RECOMPUTED',
            entityType: 'Payslip',
            entityId: payslipId,
            details: `Recomputed attendance proration for employee=${employeeId}: ${previousProration} -> ${prorationDeduction} (absent=${absentDays}, unpaidLeave=${deductibleLeaveDays})`,
            changes: {
                previousProration,
                prorationDeduction,
                absentDays,
                deductibleLeaveDays,
            },
            tx,
        });
    };
}

// ─── KASBON ───

export const getLoanPortfolioSummary = withTenant(
    async function getLoanPortfolioSummary() {
        return safeAction(async () => {
            await requireHrdFinance();
            return EmployeeLoanService.getPortfolioSummary(prisma);
        });
    },
);

export const listLoans = withTenant(async function listLoans(filters?: {
    employeeId?: string;
    status?: 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED';
}) {
    return safeAction(async () => {
        await requireHrdFinance();
        // Serialize Decimal → number so client never calls .toNumber() on a string
        return serializeData(await EmployeeLoanService.list(prisma, filters));
    });
});

export const createLoan = withTenant(async function createLoan(
    data: CreateLoanInput,
) {
    return safeAction(async () => {
        const session = await requireHrdApprover();
        const withApprover = {
            ...data,
            approvedById: data.approvedById ?? session.user.id,
        };
        const loan = await EmployeeLoanService.create(prisma, withApprover);
        await logActivity({
            userId: session.user.id,
            action: 'LOAN_CREATED',
            entityType: 'EmployeeLoan',
            entityId: loan.id,
            details: `Created kasbon ${loan.loanNumber} for ${loan.employee.code} — ${loan.employee.name}: ${loan.principalAmount} (${loan.repaymentType})`,
        });
        return serializeData(loan);
    });
});

export const markLoanDefaulted = withTenant(async function markLoanDefaulted(
    id: string,
) {
    return safeAction(async () => {
        const session = await requireHrdApprover();
        const loan = await EmployeeLoanService.markDefaulted(prisma, id);
        await logActivity({
            userId: session.user.id,
            action: 'LOAN_STATUS_CHANGED',
            entityType: 'EmployeeLoan',
            entityId: id,
            details: `Loan ${loan.loanNumber} marked DEFAULTED`,
        });
        return serializeData(loan);
    });
});

export const recordLoanPayment = withTenant(async function recordLoanPayment(
    id: string,
    data: RecordLoanPaymentInput,
) {
    return safeAction(async () => {
        const session = await requireHrdApprover();
        const amount = assertPositiveFinite(data.amount, 'Nominal pembayaran');
        const date = toValidDate(data.date, 'Tanggal pembayaran');
        const result = await EmployeeLoanService.recordPayment(
            prisma,
            id,
            { ...data, amount, date },
            { onCommit: auditLoanPayment(session.user.id, id) },
        );
        return serializeData(result);
    });
});

// ─── ALLOWANCES ───

export const listEmployeeAllowances = withTenant(
    async function listEmployeeAllowances(employeeId: string) {
        return safeAction(async () => {
            await requireHrdFinance();
            return EmployeeAllowanceService.list(prisma, employeeId);
        });
    },
);

export const replaceEmployeeAllowances = withTenant(
    async function replaceEmployeeAllowances(
        employeeId: string,
        items: Array<AllowanceInput & { id?: string }>,
    ) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const result = await EmployeeAllowanceService.replaceForEmployee(
                prisma,
                employeeId,
                items,
            );
            await logActivity({
                userId: session.user.id,
                action: 'EMPLOYEE_ALLOWANCES_UPDATED',
                entityType: 'Employee',
                entityId: employeeId,
                details: `Replaced allowances (${result.length} active rows)`,
            });
            return result;
        });
    },
);

// ─── PAYROLL BULANAN ───

export const listPayrollPeriods = withTenant(
    async function listPayrollPeriods() {
        return safeAction(async () => {
            await requireHrdFinance();
            return PayrollMonthlyService.listPeriods(prisma);
        });
    },
);

export const generatePayslips = withTenant(async function generatePayslips(
    input: GeneratePayslipsInput,
) {
    return safeAction(async () => {
        const session = await requireHrdApprover();
        assertValidPeriod(input);
        return PayrollMonthlyService.generateDrafts(prisma, input, {
            onCommit: auditGenerate(session.user.id),
        });
    });
});

export const listPayslipsForPeriod = withTenant(
    async function listPayslipsForPeriod(periodId: string) {
        return safeAction(async () => {
            await requireHrdFinance();
            return PayrollMonthlyService.listPayslips(prisma, periodId);
        });
    },
);

export const updateDraftPayslip = withTenant(async function updateDraftPayslip(
    payslipId: string,
    patch: UpdateDraftPayslipInput,
) {
    return safeAction(async () => {
        const session = await requireHrdApprover();
        const slip = await PayrollMonthlyService.updateDraft(
            prisma,
            payslipId,
            patch,
        );
        await logActivity({
            userId: session.user.id,
            action: 'PAYSLIP_DRAFT_UPDATED',
            entityType: 'Payslip',
            entityId: payslipId,
            details: `Updated draft payslip thr=${slip.thrAmount} bpjs=${slip.bpjsDeduction} loan=${slip.loanDeduction} other=${slip.otherDeductions} prorata=${slip.prorationDeduction} net=${slip.netPay}`,
        });
        return slip;
    });
});

export const getPayslipAttendanceBasis = withTenant(
    async function getPayslipAttendanceBasis(payslipId: string) {
        return safeAction(async () => {
            await requireHrdFinance();
            return serializeData(
                await PayrollMonthlyService.getAttendanceBasis(
                    prisma,
                    payslipId,
                ),
            );
        });
    },
);

export const recomputePayslipProration = withTenant(
    async function recomputePayslipProration(payslipId: string) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            return serializeData(
                await PayrollMonthlyService.recomputeDraftProration(
                    prisma,
                    payslipId,
                    {
                        onCommit: auditRecomputeProration(
                            session.user.id,
                            payslipId,
                        ),
                    },
                ),
            );
        });
    },
);

export const finalizePayslip = withTenant(async function finalizePayslip(
    payslipId: string,
) {
    return safeAction(async () => {
        const session = await requireHrdApprover();
        return PayrollMonthlyService.finalize(prisma, payslipId, {
            onCommit: auditFinalize(session.user.id, payslipId),
        });
    });
});

export const markPayslipPaid = withTenant(async function markPayslipPaid(
    payslipId: string,
) {
    return safeAction(async () => {
        const session = await requireHrdFinance();
        return PayrollMonthlyService.markPaid(prisma, payslipId, {
            onCommit: auditMarkPaid(session.user.id, payslipId),
        });
    });
});

// ─── Gelombang A2: Un-finalize ───

export const unfinalizePayslip = withTenant(async function unfinalizePayslip(
    payslipId: string,
) {
    return safeAction(async () => {
        const session = await requireHrdApprover();
        return PayrollMonthlyService.unfinalize(prisma, payslipId, {
            onCommit: auditUnfinalize(session.user.id, payslipId),
        });
    });
});

export const closePayrollPeriod = withTenant(async function closePayrollPeriod(
    periodId: string,
) {
    return safeAction(async () => {
        const session = await requireHrdApprover();
        return PayrollMonthlyService.closePeriod(
            prisma,
            periodId,
            session.user.id,
            { onCommit: auditClosePeriod(session.user.id, periodId) },
        );
    });
});
