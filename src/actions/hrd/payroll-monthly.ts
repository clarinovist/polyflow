'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdApprover, requireHrdFinance } from '@/lib/auth/hrd-access';
import { logActivity } from '@/lib/tools/audit';
import {
    EmployeeAllowanceService,
    EmployeeLoanService,
    PayrollMonthlyService,
    type AllowanceInput,
    type CreateLoanInput,
    type GeneratePayslipsInput,
    type UpdateDraftPayslipInput,
} from '@/services/hrd/payroll-monthly-service';

// ─── KASBON ───

export const listLoans = withTenant(
    async function listLoans(filters?: { employeeId?: string; status?: 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED' }) {
        return safeAction(async () => {
            await requireHrdFinance();
            return EmployeeLoanService.list(prisma, filters);
        });
    },
);

export const createLoan = withTenant(
    async function createLoan(data: CreateLoanInput) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const withApprover = { ...data, approvedById: data.approvedById ?? session.user.id };
            const loan = await EmployeeLoanService.create(prisma, withApprover);
            await logActivity({
                userId: session.user.id,
                action: 'LOAN_CREATED',
                entityType: 'EmployeeLoan',
                entityId: loan.id,
                details: `Created kasbon ${loan.loanNumber} for ${loan.employee.code} — ${loan.employee.name}: ${loan.principalAmount} (${loan.repaymentType})`,
            });
            return loan;
        });
    },
);

export const markLoanDefaulted = withTenant(
    async function markLoanDefaulted(id: string) {
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
            return loan;
        });
    },
);

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
            const result = await EmployeeAllowanceService.replaceForEmployee(prisma, employeeId, items);
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

export const generatePayslips = withTenant(
    async function generatePayslips(input: GeneratePayslipsInput) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const result = await PayrollMonthlyService.generateDrafts(prisma, input);
            await logActivity({
                userId: session.user.id,
                action: 'PAYROLL_GENERATED',
                entityType: 'PayrollPeriod',
                entityId: result.periodId,
                details: `Generated ${result.created} payslips (${result.skipped} skipped) for ${input.year}-${String(input.month).padStart(2, '0')}`,
            });
            return result;
        });
    },
);

export const listPayslipsForPeriod = withTenant(
    async function listPayslipsForPeriod(periodId: string) {
        return safeAction(async () => {
            await requireHrdFinance();
            return PayrollMonthlyService.listPayslips(prisma, periodId);
        });
    },
);

export const updateDraftPayslip = withTenant(
    async function updateDraftPayslip(payslipId: string, patch: UpdateDraftPayslipInput) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const slip = await PayrollMonthlyService.updateDraft(prisma, payslipId, patch);
            await logActivity({
                userId: session.user.id,
                action: 'PAYSLIP_DRAFT_UPDATED',
                entityType: 'Payslip',
                entityId: payslipId,
                details: `Updated draft payslip thr=${slip.thrAmount} bpjs=${slip.bpjsDeduction} loan=${slip.loanDeduction} other=${slip.otherDeductions} prorata=${slip.prorationDeduction} net=${slip.netPay}`,
            });
            return slip;
        });
    },
);

export const finalizePayslip = withTenant(
    async function finalizePayslip(payslipId: string) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const slip = await PayrollMonthlyService.finalize(prisma, payslipId);
            await logActivity({
                userId: session.user.id,
                action: 'PAYSLIP_FINALIZED',
                entityType: 'Payslip',
                entityId: payslipId,
                details: `Finalized payslip for employee=${slip.employeeId}, netPay=${slip.netPay}`,
            });
            return slip;
        });
    },
);

export const markPayslipPaid = withTenant(
    async function markPayslipPaid(payslipId: string) {
        return safeAction(async () => {
            const session = await requireHrdFinance();
            const slip = await PayrollMonthlyService.markPaid(prisma, payslipId);
            await logActivity({
                userId: session.user.id,
                action: 'PAYSLIP_PAID',
                entityType: 'Payslip',
                entityId: payslipId,
                details: `Marked payslip PAID`,
            });
            return slip;
        });
    },
);

export const closePayrollPeriod = withTenant(
    async function closePayrollPeriod(periodId: string) {
        return safeAction(async () => {
            const session = await requireHrdApprover();
            const result = await PayrollMonthlyService.closePeriod(prisma, periodId, session.user.id);
            await logActivity({
                userId: session.user.id,
                action: 'PAYROLL_PERIOD_CLOSED',
                entityType: 'PayrollPeriod',
                entityId: periodId,
                details: `Closed payroll period ${result.year}-${String(result.month).padStart(2, '0')}`,
            });
            return result;
        });
    },
);
