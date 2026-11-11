/**
 * Kasbon (EmployeeLoan) + payroll bulanan + employee allowances.
 * Plan §1-7 / Fase 5 — pure service (no 'use server').
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import {
    applyLoanAllocation,
    planLoanAllocations,
    reverseLoanPayment,
    settleLoanIfPaidOff,
} from './payroll-loan-tx';
import {
    computePayslipAmounts,
    nextDeductionAmount,
    round2,
} from './payroll-monthly-math';
import {
    generateDraftsInTx,
    readPayslipAttendanceBasis,
    recomputeProrationInTx,
    upsertPeriod,
    type GeneratePayslipsInput,
    type GenerateDraftsResult,
} from './payroll-draft-generation';
import {
    assertLoanDeductionAllowed,
    assertValidDraftPatch,
    type UpdateDraftPayslipInput,
} from './payroll-draft-validation';
import { runOnCommit, type PayrollTxOptions } from './payroll-tx-options';

// Public API stays importable from this module.
export {
    computePayslipAmounts,
    countMonToSat,
    isLoanDeductibleInPeriod,
    nextDeductionAmount,
    yearMonthKey,
} from './payroll-monthly-math';
export type { ComputePayslipInput } from './payroll-monthly-math';
export type {
    GeneratePayslipsInput,
    GenerateDraftsResult,
    DraftWarning,
    PayslipAttendanceBasis as AttendanceBasis,
} from './payroll-draft-generation';
export type { UpdateDraftPayslipInput } from './payroll-draft-validation';
export type { PayrollTxOptions } from './payroll-tx-options';
export {
    EmployeeAllowanceService,
    type AllowanceInput,
} from './payroll-allowance-service';

/** Interactive tx for generateDrafts creates one payslip per employee: widen Prisma's 5s default. */
const GENERATE_DRAFTS_TX_TIMEOUT_MS = 30_000;
const PRISMA_UNIQUE_VIOLATION = 'P2002';

// ───────────────────────────────────────────────────
// KASBON
// ───────────────────────────────────────────────────

export interface CreateLoanInput {
    employeeId: string;
    date: Date;
    principalAmount: number;
    reason?: string;
    repaymentType: 'INSTALLMENT' | 'FULL_NEXT_MONTH';
    installmentAmount?: number;
    collateralDescription?: string;
    collateralPhotoUrl?: string;
    approvedById?: string;
}

export interface RecordLoanPaymentInput {
    amount: number;
    date: Date;
    notes?: string;
}

type TxClient = Prisma.TransactionClient;

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: unknown }).code === PRISMA_UNIQUE_VIOLATION
    );
}

/**
 * An atomic status claim matched nothing: read the row inside the same tx
 * to tell "missing" from "wrong status" and build the matching error.
 */
async function payslipClaimRejection(
    tx: TxClient,
    payslipId: string,
    explainStatus: (status: string) => string,
): Promise<Error> {
    const row = await tx.payslip.findUnique({
        where: { id: payslipId },
        select: { status: true },
    });
    if (!row) return new NotFoundError('Payslip tidak ditemukan');
    return new BusinessRuleError(explainStatus(row.status));
}

async function readPayslipWithEmployee(tx: TxClient, payslipId: string) {
    const slip = await tx.payslip.findUnique({
        where: { id: payslipId },
        include: { employee: { select: { id: true, name: true, code: true } } },
    });
    if (!slip) throw new NotFoundError('Payslip tidak ditemukan');
    return slip;
}

async function nextLoanNumberInTx(tx: TxClient, year: number): Promise<string> {
    const prefix = `KSB-${year}-`;
    const last = await tx.employeeLoan.findFirst({
        where: { loanNumber: { startsWith: prefix } },
        orderBy: { loanNumber: 'desc' },
        select: { loanNumber: true },
    });
    let next = 1;
    if (last) {
        const m = last.loanNumber.match(/KSB-\d{4}-(\d+)/);
        if (m) next = parseInt(m[1], 10) + 1;
    }
    return `${prefix}${String(next).padStart(4, '0')}`;
}

/** Atomic payment claim matched nothing: explain why, reading inside the same tx. */
async function loanPaymentRejection(
    tx: TxClient,
    loanId: string,
): Promise<Error> {
    const loan = await tx.employeeLoan.findUnique({
        where: { id: loanId },
        select: { status: true, remainingBalance: true },
    });
    if (!loan) return new NotFoundError('Kasbon tidak ditemukan');
    if (loan.status === 'PAID_OFF')
        return new BusinessRuleError('Kasbon ini sudah LUNAS');
    if (loan.status !== 'ACTIVE')
        return new BusinessRuleError(
            'Kasbon DEFAULTED tidak bisa menerima pembayaran manual',
        );
    return new BusinessRuleError(
        `Pembayaran melebihi sisa kasbon (${Number(loan.remainingBalance)})`,
    );
}

export const EmployeeLoanService = {
    async list(
        db: PrismaClient,
        filters?: {
            employeeId?: string;
            status?: 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED';
        },
    ) {
        const where: Prisma.EmployeeLoanWhereInput = {};
        if (filters?.employeeId) where.employeeId = filters.employeeId;
        if (filters?.status) where.status = filters.status;
        return db.employeeLoan.findMany({
            where,
            include: {
                employee: { select: { id: true, name: true, code: true } },
                payments: { orderBy: { date: 'desc' }, take: 50 },
            },
            orderBy: { date: 'desc' },
        });
    },

    /** Company-wide portfolio totals for HRD rekap. */
    async getPortfolioSummary(db: PrismaClient) {
        const rows = await db.employeeLoan.findMany({
            select: {
                status: true,
                principalAmount: true,
                remainingBalance: true,
            },
        });
        const round2 = (n: number) => Math.round(n * 100) / 100;
        let activeCount = 0;
        let paidOffCount = 0;
        let defaultedCount = 0;
        let sumPrincipalActive = 0;
        let sumRemainingActive = 0;
        for (const r of rows) {
            if (r.status === 'ACTIVE') {
                activeCount += 1;
                sumPrincipalActive += Number(r.principalAmount);
                sumRemainingActive += Number(r.remainingBalance);
            } else if (r.status === 'PAID_OFF') {
                paidOffCount += 1;
            } else if (r.status === 'DEFAULTED') {
                defaultedCount += 1;
            }
        }
        return {
            activeCount,
            paidOffCount,
            defaultedCount,
            sumPrincipalActive: round2(sumPrincipalActive),
            sumRemainingActive: round2(sumRemainingActive),
        };
    },

    async nextLoanNumber(db: PrismaClient, year: number): Promise<string> {
        return nextLoanNumberInTx(db, year);
    },

    async create(db: PrismaClient, data: CreateLoanInput) {
        if (data.principalAmount <= 0)
            throw new BusinessRuleError('Jumlah kasbon harus > 0');
        if (data.repaymentType === 'INSTALLMENT') {
            if (!data.installmentAmount || data.installmentAmount <= 0) {
                throw new BusinessRuleError(
                    'Cicilan per bulan wajib diisi untuk tipe INSTALLMENT',
                );
            }
            if (data.installmentAmount > data.principalAmount) {
                throw new BusinessRuleError(
                    'Cicilan tidak boleh melebihi pinjaman pokok',
                );
            }
        }

        const employee = await db.employee.findUnique({
            where: { id: data.employeeId },
            select: { id: true, name: true, code: true },
        });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');

        // Serialize create + number gen + active-loan check inside a transaction.
        return db.$transaction(async (tx) => {
            const active = await tx.employeeLoan.findFirst({
                where: { employeeId: data.employeeId, status: 'ACTIVE' },
                select: { id: true, loanNumber: true },
            });
            if (active) {
                throw new BusinessRuleError(
                    `Karyawan masih punya kasbon aktif (${active.loanNumber}). Lunasi dulu sebelum mengajukan baru.`,
                );
            }

            const year = data.date.getUTCFullYear();
            const loanNumber = await nextLoanNumberInTx(tx, year);

            return tx.employeeLoan.create({
                data: {
                    loanNumber,
                    employeeId: data.employeeId,
                    date: data.date,
                    principalAmount: data.principalAmount,
                    reason: data.reason?.trim() || null,
                    repaymentType: data.repaymentType,
                    installmentAmount:
                        data.repaymentType === 'INSTALLMENT'
                            ? (data.installmentAmount ?? null)
                            : null,
                    remainingBalance: data.principalAmount,
                    status: 'ACTIVE',
                    collateralDescription:
                        data.collateralDescription?.trim() || null,
                    collateralPhotoUrl: data.collateralPhotoUrl ?? null,
                    approvedById: data.approvedById ?? null,
                },
                include: {
                    employee: { select: { id: true, name: true, code: true } },
                },
            });
        });
    },

    async markDefaulted(db: PrismaClient, id: string) {
        const loan = await db.employeeLoan.findUnique({ where: { id } });
        if (!loan) throw new NotFoundError('Kasbon tidak ditemukan');
        if (loan.status !== 'ACTIVE')
            throw new BusinessRuleError(
                'Hanya kasbon ACTIVE yang bisa ditandai DEFAULTED',
            );
        return db.employeeLoan.update({
            where: { id },
            data: { status: 'DEFAULTED' },
        });
    },

    /**
     * Record a manual (offline cash) payment against an ACTIVE loan.
     * - Creates EmployeeLoanPayment with payslipId NULL (outside payroll)
     * - Marks loan PAID_OFF when remaining hits 0
     * - Rejects overpayment and payments on PAID_OFF/DEFAULTED loans
     */
    async recordPayment(
        db: PrismaClient,
        loanId: string,
        data: RecordLoanPaymentInput,
        options?: PayrollTxOptions,
    ) {
        const amount = round2(data.amount);
        if (!Number.isFinite(amount) || amount <= 0)
            throw new BusinessRuleError('Jumlah pembayaran harus > 0');

        return db.$transaction(async (tx) => {
            // Atomic claim: only an ACTIVE loan with enough balance is decremented.
            const claimed = await tx.employeeLoan.updateMany({
                where: {
                    id: loanId,
                    status: 'ACTIVE',
                    remainingBalance: { gte: amount },
                },
                data: { remainingBalance: { decrement: amount } },
            });
            if (claimed.count !== 1) {
                throw await loanPaymentRejection(tx, loanId);
            }

            const payment = await tx.employeeLoanPayment.create({
                data: {
                    loanId,
                    payslipId: null,
                    amount,
                    date: data.date,
                    notes: data.notes?.trim() || null,
                },
            });
            await settleLoanIfPaidOff(tx, loanId);
            const loan = await tx.employeeLoan.findUnique({
                where: { id: loanId },
                include: {
                    employee: { select: { id: true, name: true, code: true } },
                },
            });
            if (!loan) throw new NotFoundError('Kasbon tidak ditemukan');

            await runOnCommit(tx, options, {
                paymentAmount: amount,
                loanNumber: loan.loanNumber,
                employeeCode: loan.employee.code,
                employeeName: loan.employee.name,
                remainingBalance: Number(loan.remainingBalance),
                status: loan.status,
            });
            return { payment, loan };
        });
    },

    nextDeductionAmount,
};

// ───────────────────────────────────────────────────
// PAYROLL BULANAN
// ───────────────────────────────────────────────────

/** Atomic period claim matched nothing: explain why, reading inside the same tx. */
async function periodClaimRejection(
    tx: TxClient,
    periodId: string,
): Promise<Error> {
    const row = await tx.payrollPeriod.findUnique({
        where: { id: periodId },
        select: { status: true },
    });
    if (!row) return new NotFoundError('Periode tidak ditemukan');
    if (row.status === 'CLOSED')
        return new BusinessRuleError('Periode sudah CLOSED');
    return new BusinessRuleError('Status periode tidak valid');
}

function explainUnfinalizeRejection(status: string): string {
    if (status === 'DRAFT') return 'Payslip sudah DRAFT';
    if (status === 'PAID') return 'Payslip PAID tidak bisa di-unfinalize';
    return 'Status tidak valid untuk unfinalize';
}

export const PayrollMonthlyService = {
    async listPeriods(db: PrismaClient) {
        return db.payrollPeriod.findMany({
            orderBy: [{ year: 'desc' }, { month: 'desc' }],
        });
    },

    async getOrCreatePeriod(db: PrismaClient, year: number, month: number) {
        return upsertPeriod(db, year, month);
    },

    /**
     * Generate draft payslips for all active MONTHLY employees in this period.
     * Idempotent for existing payslips (skipped). Employees without salary skipped.
     * All-or-nothing: one transaction; a concurrent double click hits the unique
     * (period, employee) constraint and is reported instead of leaving half a batch.
     *
     * Proration follows the attendance basis (payroll-attendance-basis.ts): alpa and
     * approved unpaid-type leave are deducted; days with no record only produce a
     * warning (`warnings`), never a deduction.
     */
    async generateDrafts(
        db: PrismaClient,
        input: GeneratePayslipsInput,
        options?: PayrollTxOptions,
    ): Promise<GenerateDraftsResult> {
        try {
            return await db.$transaction(
                (tx) => generateDraftsInTx(tx, input, options),
                { timeout: GENERATE_DRAFTS_TX_TIMEOUT_MS },
            );
        } catch (error) {
            if (isUniqueViolation(error)) {
                throw new BusinessRuleError(
                    'Draft sedang dibuat, muat ulang halaman',
                );
            }
            throw error;
        }
    },

    /** Read-only attendance basis of a payslip, from the current attendance data. */
    async getAttendanceBasis(db: PrismaClient, payslipId: string) {
        return readPayslipAttendanceBasis(db, payslipId);
    },

    /**
     * Recompute the attendance proration of a DRAFT payslip (overwrites manual
     * proration; other components unchanged). Atomic DRAFT claim, one transaction.
     */
    async recomputeDraftProration(
        db: PrismaClient,
        payslipId: string,
        options?: PayrollTxOptions,
    ) {
        return db.$transaction(async (tx) => {
            const claimed = await tx.payslip.updateMany({
                where: { id: payslipId, status: 'DRAFT' },
                data: { status: 'DRAFT' },
            });
            if (claimed.count !== 1) {
                throw await payslipClaimRejection(
                    tx,
                    payslipId,
                    () => 'Hanya payslip DRAFT yang bisa dihitung ulang',
                );
            }
            return recomputeProrationInTx(tx, payslipId, options);
        });
    },

    async listPayslips(db: PrismaClient, periodId: string) {
        return db.payslip.findMany({
            where: { payrollPeriodId: periodId },
            include: {
                employee: { select: { id: true, name: true, code: true } },
                allowances: true,
                loanPayments: {
                    include: { loan: { select: { loanNumber: true } } },
                },
            },
            orderBy: { employee: { code: 'asc' } },
        });
    },

    /**
     * List payslips for a single employee across all periods (most recent first).
     * Used by employee 360° profile monthly payroll tab.
     */
    async listByEmployee(db: PrismaClient, employeeId: string) {
        return db.payslip.findMany({
            where: { employeeId },
            include: {
                employee: { select: { id: true, name: true, code: true } },
                allowances: true,
                loanPayments: {
                    include: { loan: { select: { loanNumber: true } } },
                },
                payrollPeriod: {
                    select: { id: true, year: true, month: true, status: true },
                },
            },
            orderBy: [
                { payrollPeriod: { year: 'desc' } },
                { payrollPeriod: { month: 'desc' } },
            ],
        });
    },

    /**
     * Manual correction of a DRAFT payslip (THR, overrides, other deductions).
     * Recomputes gross/deduction/net from baseSalary + allowanceTotal (frozen at generate)
     * plus editable fields. Invalid numbers are rejected (never silently clamped) and
     * loanDeduction may not exceed what the active loans entitle for the slip's period.
     */
    async updateDraft(
        db: PrismaClient,
        payslipId: string,
        patch: UpdateDraftPayslipInput,
    ) {
        assertValidDraftPatch(patch);

        const payslip = await db.payslip.findUnique({
            where: { id: payslipId },
            include: { payrollPeriod: { select: { year: true, month: true } } },
        });
        if (!payslip) throw new NotFoundError('Payslip tidak ditemukan');
        if (payslip.status !== 'DRAFT') {
            throw new BusinessRuleError('Hanya payslip DRAFT yang bisa diedit');
        }
        if (patch.loanDeduction !== undefined) {
            await assertLoanDeductionAllowed(db, payslip, patch.loanDeduction);
        }

        const amounts = computePayslipAmounts({
            baseSalary: Number(payslip.baseSalary),
            allowanceTotal: Number(payslip.allowanceTotal),
            thrAmount: patch.thrAmount ?? Number(payslip.thrAmount),
            prorationDeduction:
                patch.prorationDeduction ?? Number(payslip.prorationDeduction),
            bpjsDeduction: patch.bpjsDeduction ?? Number(payslip.bpjsDeduction),
            loanDeduction: patch.loanDeduction ?? Number(payslip.loanDeduction),
            otherDeductions:
                patch.otherDeductions ?? Number(payslip.otherDeductions),
        });

        // Guarded write: a finalize that claimed the slip meanwhile makes this match nothing,
        // so an edit can never change loanDeduction after payments were derived from it.
        const written = await db.payslip.updateMany({
            where: { id: payslipId, status: 'DRAFT' },
            data: {
                thrAmount: amounts.thrAmount,
                prorationDeduction: amounts.prorationDeduction,
                bpjsDeduction: amounts.bpjsDeduction,
                loanDeduction: amounts.loanDeduction,
                otherDeductions: amounts.otherDeductions,
                grossPay: amounts.grossPay,
                deductionTotal: amounts.deductionTotal,
                netPay: amounts.netPay,
                ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
            },
        });
        if (written.count !== 1) {
            throw new BusinessRuleError('Hanya payslip DRAFT yang bisa diedit');
        }

        const updated = await db.payslip.findUnique({
            where: { id: payslipId },
            include: {
                employee: { select: { id: true, name: true, code: true } },
                allowances: true,
                loanPayments: {
                    include: { loan: { select: { loanNumber: true } } },
                },
            },
        });
        if (!updated) throw new NotFoundError('Payslip tidak ditemukan');
        return updated;
    },

    /**
     * Finalize a single payslip, all inside one transaction:
     * 1. Atomically claim DRAFT → FINALIZED (the loser of a race stops here).
     * 2. Split loanDeduction over ACTIVE loans (proportional, total == loanDeduction).
     * 3. Decrement each loan atomically (guarded), record payments, settle PAID_OFF.
     * Any shortfall aborts the whole transaction: no half-applied deduction.
     */
    async finalize(
        db: PrismaClient,
        payslipId: string,
        options?: PayrollTxOptions,
    ) {
        return db.$transaction(async (tx) => {
            const claimed = await tx.payslip.updateMany({
                where: { id: payslipId, status: 'DRAFT' },
                data: { status: 'FINALIZED' },
            });
            if (claimed.count !== 1) {
                throw await payslipClaimRejection(
                    tx,
                    payslipId,
                    () => 'Payslip sudah difinalize',
                );
            }

            const payslip = await tx.payslip.findUnique({
                where: { id: payslipId },
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                            loans: {
                                where: { status: 'ACTIVE' },
                                orderBy: [
                                    { date: 'asc' },
                                    { loanNumber: 'asc' },
                                ],
                            },
                        },
                    },
                },
            });
            if (!payslip) throw new NotFoundError('Payslip tidak ditemukan');

            const allocations = planLoanAllocations(payslip);
            for (const allocation of allocations) {
                await applyLoanAllocation(tx, payslip.id, allocation);
            }

            await runOnCommit(tx, options, {
                employeeId: payslip.employeeId,
                netPay: Number(payslip.netPay),
                loanDeduction: Number(payslip.loanDeduction),
                allocations,
            });

            const { employee, ...rest } = payslip;
            return {
                ...rest,
                status: 'FINALIZED' as const,
                employee: {
                    id: employee.id,
                    name: employee.name,
                    code: employee.code,
                },
            };
        });
    },

    async markPaid(
        db: PrismaClient,
        payslipId: string,
        options?: PayrollTxOptions,
    ) {
        return db.$transaction(async (tx) => {
            const claimed = await tx.payslip.updateMany({
                where: { id: payslipId, status: 'FINALIZED' },
                data: { status: 'PAID' },
            });
            if (claimed.count !== 1) {
                throw await payslipClaimRejection(
                    tx,
                    payslipId,
                    () => 'Hanya payslip FINALIZED yang bisa ditandai PAID',
                );
            }
            const payslip = await tx.payslip.findUnique({
                where: { id: payslipId },
            });
            if (!payslip) throw new NotFoundError('Payslip tidak ditemukan');
            await runOnCommit(tx, options, { employeeId: payslip.employeeId });
            return payslip;
        });
    },

    /**
     * Gelombang A2: Un-finalize a FINALIZED payslip back to DRAFT.
     * Reverses all EmployeeLoanPayment rows linked to this payslip (atomic increment).
     * - PAID payslips: rejected
     * - Period CLOSED: rejected
     * - DEFAULTED loan: balance reversed, status stays DEFAULTED
     * `onCommit` receives the reversed payment details (collected before the rows are
     * deleted) so the caller can keep them in the audit log within the same transaction.
     */
    async unfinalize(
        db: PrismaClient,
        payslipId: string,
        options?: PayrollTxOptions,
    ) {
        return db.$transaction(async (tx) => {
            const claimed = await tx.payslip.updateMany({
                where: { id: payslipId, status: 'FINALIZED' },
                data: { status: 'DRAFT' },
            });
            if (claimed.count !== 1) {
                throw await payslipClaimRejection(
                    tx,
                    payslipId,
                    explainUnfinalizeRejection,
                );
            }

            const payslip = await tx.payslip.findUnique({
                where: { id: payslipId },
                include: {
                    payrollPeriod: { select: { status: true } },
                    loanPayments: {
                        include: {
                            loan: { select: { id: true, loanNumber: true } },
                        },
                    },
                },
            });
            if (!payslip) throw new NotFoundError('Payslip tidak ditemukan');
            if (payslip.payrollPeriod.status === 'CLOSED')
                throw new BusinessRuleError('Periode sudah CLOSED');

            const reversedPayments = payslip.loanPayments.map((p) => ({
                loanId: p.loan.id,
                loanNumber: p.loan.loanNumber,
                amount: Number(p.amount),
                date: p.date,
            }));
            for (const payment of payslip.loanPayments) {
                await reverseLoanPayment(tx, payment);
            }

            await runOnCommit(tx, options, {
                employeeId: payslip.employeeId,
                reversedPayments,
            });
            return readPayslipWithEmployee(tx, payslipId);
        });
    },

    async closePeriod(
        db: PrismaClient,
        periodId: string,
        closedById: string,
        options?: PayrollTxOptions,
    ) {
        return db.$transaction(async (tx) => {
            const claimed = await tx.payrollPeriod.updateMany({
                where: { id: periodId, status: 'OPEN' },
                data: { status: 'CLOSED', closedAt: new Date(), closedById },
            });
            if (claimed.count !== 1) {
                throw await periodClaimRejection(tx, periodId);
            }
            // Unpaid slips abort the tx, which also rolls the claim back.
            const unpaid = await tx.payslip.count({
                where: { payrollPeriodId: periodId, status: { not: 'PAID' } },
            });
            if (unpaid > 0) {
                throw new BusinessRuleError(
                    `Masih ada ${unpaid} payslip belum PAID`,
                );
            }
            const period = await tx.payrollPeriod.findUnique({
                where: { id: periodId },
            });
            if (!period) throw new NotFoundError('Periode tidak ditemukan');
            await runOnCommit(tx, options, {
                year: period.year,
                month: period.month,
                closedById,
            });
            return period;
        });
    },
};
