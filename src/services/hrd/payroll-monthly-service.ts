/**
 * Kasbon (EmployeeLoan) + payroll bulanan + employee allowances.
 * Plan §1-7 / Fase 5 — pure service (no 'use server').
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

// ───────────────────────────────────────────────────
// Pure helpers (unit-testable)
// ───────────────────────────────────────────────────

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

export function dateToYearMonth(date: Date): { year: number; month: number } {
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
    const deductionTotal = round2(bpjsDeduction + loanDeduction + otherDeductions + prorationDeduction);
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

type TxClient = Prisma.TransactionClient;

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

export const EmployeeLoanService = {
    async list(db: PrismaClient, filters?: { employeeId?: string; status?: 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED' }) {
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

    async nextLoanNumber(db: PrismaClient, year: number): Promise<string> {
        return nextLoanNumberInTx(db, year);
    },

    async create(db: PrismaClient, data: CreateLoanInput) {
        if (data.principalAmount <= 0) throw new BusinessRuleError('Jumlah kasbon harus > 0');
        if (data.repaymentType === 'INSTALLMENT') {
            if (!data.installmentAmount || data.installmentAmount <= 0) {
                throw new BusinessRuleError('Cicilan per bulan wajib diisi untuk tipe INSTALLMENT');
            }
            if (data.installmentAmount > data.principalAmount) {
                throw new BusinessRuleError('Cicilan tidak boleh melebihi pinjaman pokok');
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
                    installmentAmount: data.repaymentType === 'INSTALLMENT' ? (data.installmentAmount ?? null) : null,
                    remainingBalance: data.principalAmount,
                    status: 'ACTIVE',
                    collateralDescription: data.collateralDescription?.trim() || null,
                    collateralPhotoUrl: data.collateralPhotoUrl ?? null,
                    approvedById: data.approvedById ?? null,
                },
                include: { employee: { select: { id: true, name: true, code: true } } },
            });
        });
    },

    async markDefaulted(db: PrismaClient, id: string) {
        const loan = await db.employeeLoan.findUnique({ where: { id } });
        if (!loan) throw new NotFoundError('Kasbon tidak ditemukan');
        if (loan.status !== 'ACTIVE') throw new BusinessRuleError('Hanya kasbon ACTIVE yang bisa ditandai DEFAULTED');
        return db.employeeLoan.update({ where: { id }, data: { status: 'DEFAULTED' } });
    },

    nextDeductionAmount,
};

// ───────────────────────────────────────────────────
// EMPLOYEE ALLOWANCES
// ───────────────────────────────────────────────────

export interface AllowanceInput {
    name: string;
    amount: number;
    isActive?: boolean;
}

export const EmployeeAllowanceService = {
    async list(db: PrismaClient, employeeId: string) {
        return db.employeeAllowance.findMany({
            where: { employeeId },
            orderBy: { createdAt: 'asc' },
        });
    },

    /**
     * Replace active set of allowances for an employee.
     * - Updates existing by id when provided
     * - Creates new rows without id
     * - Soft-deactivates rows not present in the payload (isActive=false)
     */
    async replaceForEmployee(db: PrismaClient, employeeId: string, items: Array<AllowanceInput & { id?: string }>) {
        const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');

        for (const item of items) {
            if (!item.name.trim()) throw new BusinessRuleError('Nama tunjangan wajib diisi');
            if (item.amount < 0) throw new BusinessRuleError('Nominal tunjangan tidak boleh negatif');
        }

        return db.$transaction(async (tx) => {
            const existing = await tx.employeeAllowance.findMany({ where: { employeeId } });
            const keepIds = new Set(items.map((i) => i.id).filter(Boolean) as string[]);

            // Soft-deactivate removed
            for (const row of existing) {
                if (!keepIds.has(row.id)) {
                    await tx.employeeAllowance.update({
                        where: { id: row.id },
                        data: { isActive: false },
                    });
                }
            }

            const results = [];
            for (const item of items) {
                if (item.id) {
                    const updated = await tx.employeeAllowance.update({
                        where: { id: item.id },
                        data: {
                            name: item.name.trim(),
                            amount: item.amount,
                            isActive: item.isActive ?? true,
                        },
                    });
                    results.push(updated);
                } else {
                    const created = await tx.employeeAllowance.create({
                        data: {
                            employeeId,
                            name: item.name.trim(),
                            amount: item.amount,
                            isActive: item.isActive ?? true,
                        },
                    });
                    results.push(created);
                }
            }
            return results;
        });
    },

    async remove(db: PrismaClient, id: string) {
        const row = await db.employeeAllowance.findUnique({ where: { id } });
        if (!row) throw new NotFoundError('Tunjangan tidak ditemukan');
        // Soft-delete to preserve history references in payslip snapshots (snapshots copy name/amount).
        return db.employeeAllowance.update({ where: { id }, data: { isActive: false } });
    },
};

// ───────────────────────────────────────────────────
// PAYROLL BULANAN
// ───────────────────────────────────────────────────

export interface GeneratePayslipsInput {
    year: number;
    month: number; // 1-12
}

export interface UpdateDraftPayslipInput {
    thrAmount?: number;
    prorationDeduction?: number;
    bpjsDeduction?: number;
    loanDeduction?: number;
    otherDeductions?: number;
    notes?: string | null;
}

export const PayrollMonthlyService = {
    async listPeriods(db: PrismaClient) {
        return db.payrollPeriod.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }] });
    },

    async getOrCreatePeriod(db: PrismaClient, year: number, month: number) {
        if (month < 1 || month > 12) throw new BusinessRuleError('Bulan tidak valid (1-12)');
        return db.payrollPeriod.upsert({
            where: { year_month: { year, month } },
            create: { year, month, status: 'OPEN' },
            update: {},
        });
    },

    /**
     * Generate draft payslips for all active MONTHLY employees in this period.
     * Idempotent for existing payslips (skipped). Employees without salary skipped.
     *
     * Proration: only explicit AttendanceRecord.status = ABSENT counts.
     * Days with no record are NOT treated as absent (admin must mark alpa).
     */
    async generateDrafts(db: PrismaClient, input: GeneratePayslipsInput): Promise<{ created: number; skipped: number; periodId: string }> {
        const period = await this.getOrCreatePeriod(db, input.year, input.month);
        if (period.status === 'CLOSED') {
            throw new BusinessRuleError(`Periode ${input.year}-${String(input.month).padStart(2, '0')} sudah CLOSED`);
        }

        const periodStart = new Date(Date.UTC(input.year, input.month - 1, 1));
        const periodEnd = new Date(Date.UTC(input.year, input.month, 0));

        const employees = await db.employee.findMany({
            where: { payType: 'MONTHLY', status: 'ACTIVE' },
            include: {
                allowances: { where: { isActive: true } },
                loans: { where: { status: 'ACTIVE' } },
            },
        });

        let created = 0;
        let skipped = 0;
        for (const emp of employees) {
            const existing = await db.payslip.findUnique({
                where: { payrollPeriodId_employeeId: { payrollPeriodId: period.id, employeeId: emp.id } },
            });
            if (existing) {
                skipped++;
                continue;
            }

            const monthlySalary = Number(emp.monthlySalary ?? 0);
            if (monthlySalary <= 0) {
                skipped++;
                continue;
            }

            const allowanceTotal = round2(emp.allowances.reduce((s, a) => s + Number(a.amount), 0));

            const absentCount = await db.attendanceRecord.count({
                where: {
                    employeeId: emp.id,
                    workDate: { gte: periodStart, lte: periodEnd },
                    status: 'ABSENT',
                },
            });
            const effectiveDays = countMonToSat(periodStart, periodEnd);
            const dailyRateEquivalent = effectiveDays > 0 ? monthlySalary / effectiveDays : 0;
            const prorationDeduction = round2(dailyRateEquivalent * absentCount);

            const bpjsDeduction = emp.bpjsParticipant
                ? round2(Number(emp.bpjsEmployeeDeduction ?? 0))
                : 0;

            let loanDeduction = 0;
            for (const loan of emp.loans) {
                loanDeduction += nextDeductionAmount(
                    {
                        repaymentType: loan.repaymentType,
                        installmentAmount: loan.installmentAmount,
                        remainingBalance: loan.remainingBalance,
                        date: loan.date,
                    },
                    input.year,
                    input.month,
                );
            }
            loanDeduction = round2(loanDeduction);

            const amounts = computePayslipAmounts({
                baseSalary: monthlySalary,
                allowanceTotal,
                thrAmount: 0,
                prorationDeduction,
                bpjsDeduction,
                loanDeduction,
                otherDeductions: 0,
            });

            await db.payslip.create({
                data: {
                    payrollPeriodId: period.id,
                    employeeId: emp.id,
                    baseSalary: amounts.baseSalary,
                    allowanceTotal: amounts.allowanceTotal,
                    thrAmount: amounts.thrAmount,
                    prorationDeduction: amounts.prorationDeduction,
                    grossPay: amounts.grossPay,
                    bpjsDeduction: amounts.bpjsDeduction,
                    loanDeduction: amounts.loanDeduction,
                    otherDeductions: amounts.otherDeductions,
                    deductionTotal: amounts.deductionTotal,
                    netPay: amounts.netPay,
                    status: 'DRAFT',
                    allowances: {
                        create: emp.allowances.map((a) => ({ name: a.name, amount: Number(a.amount) })),
                    },
                },
            });
            created++;
        }
        return { created, skipped, periodId: period.id };
    },

    async listPayslips(db: PrismaClient, periodId: string) {
        return db.payslip.findMany({
            where: { payrollPeriodId: periodId },
            include: {
                employee: { select: { id: true, name: true, code: true } },
                allowances: true,
                loanPayments: { include: { loan: { select: { loanNumber: true } } } },
            },
            orderBy: { employee: { code: 'asc' } },
        });
    },

    /**
     * Manual correction of a DRAFT payslip (THR, overrides, other deductions).
     * Recomputes gross/deduction/net from baseSalary + allowanceTotal (frozen at generate)
     * plus editable fields.
     */
    async updateDraft(db: PrismaClient, payslipId: string, patch: UpdateDraftPayslipInput) {
        const payslip = await db.payslip.findUnique({ where: { id: payslipId } });
        if (!payslip) throw new NotFoundError('Payslip tidak ditemukan');
        if (payslip.status !== 'DRAFT') {
            throw new BusinessRuleError('Hanya payslip DRAFT yang bisa diedit');
        }

        const amounts = computePayslipAmounts({
            baseSalary: Number(payslip.baseSalary),
            allowanceTotal: Number(payslip.allowanceTotal),
            thrAmount: patch.thrAmount !== undefined ? patch.thrAmount : Number(payslip.thrAmount),
            prorationDeduction:
                patch.prorationDeduction !== undefined
                    ? patch.prorationDeduction
                    : Number(payslip.prorationDeduction),
            bpjsDeduction:
                patch.bpjsDeduction !== undefined ? patch.bpjsDeduction : Number(payslip.bpjsDeduction),
            loanDeduction:
                patch.loanDeduction !== undefined ? patch.loanDeduction : Number(payslip.loanDeduction),
            otherDeductions:
                patch.otherDeductions !== undefined
                    ? patch.otherDeductions
                    : Number(payslip.otherDeductions),
        });

        return db.payslip.update({
            where: { id: payslipId },
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
            include: {
                employee: { select: { id: true, name: true, code: true } },
                allowances: true,
                loanPayments: { include: { loan: { select: { loanNumber: true } } } },
            },
        });
    },

    /**
     * Finalize a single payslip:
     * - Status DRAFT → FINALIZED
     * - Apply loanDeduction across ACTIVE loans (weighted by remaining balance)
     * - Create EmployeeLoanPayment rows; mark PAID_OFF when remaining hits 0
     */
    async finalize(db: PrismaClient, payslipId: string) {
        const payslip = await db.payslip.findUnique({
            where: { id: payslipId },
            include: { employee: { include: { loans: { where: { status: 'ACTIVE' } } } } },
        });
        if (!payslip) throw new NotFoundError('Payslip tidak ditemukan');
        if (payslip.status !== 'DRAFT') throw new BusinessRuleError('Payslip sudah difinalize');

        return db.$transaction(async (tx) => {
            const activeLoans = payslip.employee.loans;
            const totalRemaining = activeLoans.reduce((s, l) => s + Number(l.remainingBalance), 0);
            const deduction = Number(payslip.loanDeduction);

            if (deduction > 0 && activeLoans.length > 0 && totalRemaining > 0) {
                let allocated = 0;
                for (let i = 0; i < activeLoans.length; i++) {
                    const loan = activeLoans[i];
                    const isLast = i === activeLoans.length - 1;
                    let amount: number;
                    if (isLast) {
                        amount = round2(deduction - allocated);
                    } else {
                        amount = round2((Number(loan.remainingBalance) / totalRemaining) * deduction);
                        allocated = round2(allocated + amount);
                    }
                    // Cap by remaining balance to avoid negative.
                    amount = Math.min(amount, Number(loan.remainingBalance));
                    if (amount <= 0) continue;
                    const remaining = Math.max(0, round2(Number(loan.remainingBalance) - amount));
                    await tx.employeeLoanPayment.create({
                        data: {
                            loanId: loan.id,
                            payslipId: payslip.id,
                            amount,
                            date: new Date(),
                            notes: `Auto-deducted from payslip ${payslip.id}`,
                        },
                    });
                    await tx.employeeLoan.update({
                        where: { id: loan.id },
                        data: {
                            remainingBalance: remaining,
                            status: remaining <= 0 ? 'PAID_OFF' : 'ACTIVE',
                        },
                    });
                }
            }

            return tx.payslip.update({
                where: { id: payslipId },
                data: { status: 'FINALIZED' },
                include: {
                    employee: { select: { id: true, name: true, code: true } },
                },
            });
        });
    },

    async markPaid(db: PrismaClient, payslipId: string) {
        const payslip = await db.payslip.findUnique({ where: { id: payslipId } });
        if (!payslip) throw new NotFoundError('Payslip tidak ditemukan');
        if (payslip.status !== 'FINALIZED') {
            throw new BusinessRuleError('Hanya payslip FINALIZED yang bisa ditandai PAID');
        }
        return db.payslip.update({ where: { id: payslipId }, data: { status: 'PAID' } });
    },

    /**
     * Gelombang A2: Un-finalize a FINALIZED payslip back to DRAFT.
     * Reverses all EmployeeLoanPayment rows linked to this payslip.
     * - PAID payslips: rejected
     * - Period CLOSED: rejected
     * - DEFAULTED loan: balance reversed, status stays DEFAULTED
     */
    async unfinalize(db: PrismaClient, payslipId: string) {
        const payslip = await db.payslip.findUnique({
            where: { id: payslipId },
            include: {
                payrollPeriod: true,
                loanPayments: { include: { loan: true } },
            },
        });
        if (!payslip) throw new NotFoundError('Payslip tidak ditemukan');
        if (payslip.status === 'DRAFT') throw new BusinessRuleError('Payslip sudah DRAFT');
        if (payslip.status === 'PAID') throw new BusinessRuleError('Payslip PAID tidak bisa di-unfinalize');
        if (payslip.payrollPeriod.status === 'CLOSED') throw new BusinessRuleError('Periode sudah CLOSED');
        if (payslip.status !== 'FINALIZED') throw new BusinessRuleError('Status tidak valid untuk unfinalize');

        return db.$transaction(async (tx) => {
            // Reverse each loan payment
            for (const payment of payslip.loanPayments) {
                const loan = payment.loan;
                const paymentAmount = Number(payment.amount);
                const newRemaining = round2(Number(loan.remainingBalance) + paymentAmount);

                // Update loan: restore balance
                const updateData: { remainingBalance: number; status?: 'ACTIVE' | 'PAID_OFF' | 'DEFAULTED' } = {
                    remainingBalance: newRemaining,
                };

                // If loan was PAID_OFF due to this payment, reactivate it
                // But if loan is DEFAULTED, keep it DEFAULTED (per plan §3.2)
                if (loan.status === 'PAID_OFF' && newRemaining > 0) {
                    updateData.status = 'ACTIVE';
                }

                await tx.employeeLoan.update({
                    where: { id: loan.id },
                    data: updateData,
                });

                // Delete the payment row
                await tx.employeeLoanPayment.delete({
                    where: { id: payment.id },
                });
            }

            // Set payslip back to DRAFT
            return tx.payslip.update({
                where: { id: payslipId },
                data: { status: 'DRAFT' },
                include: {
                    employee: { select: { id: true, name: true, code: true } },
                },
            });
        });
    },

    async closePeriod(db: PrismaClient, periodId: string, closedById: string) {
        const period = await db.payrollPeriod.findUnique({
            where: { id: periodId },
            include: { payslips: { select: { id: true, status: true } } },
        });
        if (!period) throw new NotFoundError('Periode tidak ditemukan');
        if (period.status === 'CLOSED') throw new BusinessRuleError('Periode sudah CLOSED');
        const unpaid = period.payslips.filter((p) => p.status !== 'PAID');
        if (unpaid.length > 0) {
            throw new BusinessRuleError(`Masih ada ${unpaid.length} payslip belum PAID`);
        }
        return db.payrollPeriod.update({
            where: { id: periodId },
            data: { status: 'CLOSED', closedAt: new Date(), closedById },
        });
    },
};
