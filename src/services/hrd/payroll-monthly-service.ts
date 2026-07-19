'use server';

/**
 * Kasbon (EmployeeLoan) service + payroll monthly service.
 * Plan §1-7. Two-service pattern: this is the additive file (kasbon first, payroll below).
 */

import type { PrismaClient, Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';

// ───────────────────────────────────────────────────
// KASBON — employee-loan-service.ts (kept in one file for Fase 5)
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

export const EmployeeLoanService = {
    /** List loans with optional employee filter. */
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

    /** Generate next loan number KSB-YYYY-NNNN. */
    async nextLoanNumber(db: PrismaClient, year: number): Promise<string> {
        const prefix = `KSB-${year}-`;
        const last = await db.employeeLoan.findFirst({
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

        // Guard: only 1 ACTIVE loan per employee (DB-side partial unique index is the safety net,
        // but service-side guard gives a friendly error first).
        const active = await db.employeeLoan.findFirst({
            where: { employeeId: data.employeeId, status: 'ACTIVE' },
            select: { id: true, loanNumber: true },
        });
        if (active) {
            throw new BusinessRuleError(
                `Karyawan masih punya kasbon aktif (${active.loanNumber}). Lunasi dulu sebelum mengajukan baru.`,
            );
        }

        const employee = await db.employee.findUnique({
            where: { id: data.employeeId },
            select: { id: true, name: true, code: true },
        });
        if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');

        const year = data.date.getUTCFullYear();
        const loanNumber = await this.nextLoanNumber(db, year);

        return db.employeeLoan.create({
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
    },

    /** Mark loan as DEFAULTED (manual, e.g. karyawan resign with sisa). */
    async markDefaulted(db: PrismaClient, id: string) {
        const loan = await db.employeeLoan.findUnique({ where: { id } });
        if (!loan) throw new NotFoundError('Kasbon tidak ditemukan');
        if (loan.status !== 'ACTIVE') throw new BusinessRuleError('Hanya kasbon ACTIVE yang bisa ditandai DEFAULTED');
        return db.employeeLoan.update({ where: { id }, data: { status: 'DEFAULTED' } });
    },

    /** Amount to deduct in next payroll run, given the current loan state. */
    nextDeductionAmount(loan: { repaymentType: 'INSTALLMENT' | 'FULL_NEXT_MONTH'; installmentAmount: Prisma.Decimal | null; remainingBalance: Prisma.Decimal }): number {
        const remaining = Number(loan.remainingBalance);
        if (remaining <= 0) return 0;
        if (loan.repaymentType === 'FULL_NEXT_MONTH') return remaining;
        const inst = Number(loan.installmentAmount ?? 0);
        if (inst <= 0) return 0;
        return Math.min(inst, remaining);
    },
};

// ───────────────────────────────────────────────────
// PAYROLL BULANAN
// ───────────────────────────────────────────────────

export interface GeneratePayslipsInput {
    year: number;
    month: number; // 1-12
}

export interface PayslipResult {
    id: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    baseSalary: number;
    allowanceTotal: number;
    thrAmount: number;
    prorationDeduction: number;
    grossPay: number;
    bpjsDeduction: number;
    loanDeduction: number;
    otherDeductions: number;
    deductionTotal: number;
    netPay: number;
    status: 'DRAFT' | 'FINALIZED' | 'PAID';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

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
     * Idempotent: re-running finds existing drafts and skips creating duplicates
     * (relies on @@unique([payrollPeriodId, employeeId])).
     *
     * Proration policy (§1): default full month. Deduct proportional to days ABSENT
     * (tanpa keterangan) in [periodStart, periodEnd]. ON_LEAVE ber-keterangan tidak
     * dipotong otomatis. Pembagi = jumlah hari kerja efektif (Senin–Sabtu) di bulan itu,
     * supaya gaji 1 hari = monthlySalary / hariKerjaEfektif.
     */
    async generateDrafts(db: PrismaClient, input: GeneratePayslipsInput): Promise<{ created: number; skipped: number; periodId: string }> {
        const period = await this.getOrCreatePeriod(db, input.year, input.month);
        if (period.status === 'CLOSED') {
            throw new BusinessRuleError(`Periode ${input.year}-${String(input.month).padStart(2, '0')} sudah CLOSED`);
        }

        // Period date range (UTC, .db.Date stored as date-only).
        const periodStart = new Date(Date.UTC(input.year, input.month - 1, 1));
        const periodEnd = new Date(Date.UTC(input.year, input.month, 0)); // last day of month

        const employees = await db.employee.findMany({
            where: { payType: 'MONTHLY', status: 'ACTIVE' },
            include: { allowances: { where: { isActive: true } }, loans: { where: { status: 'ACTIVE' } } },
        });

        let created = 0;
        let skipped = 0;
        for (const emp of employees) {
            const existing = await db.payslip.findUnique({
                where: { payrollPeriodId_employeeId: { payrollPeriodId: period.id, employeeId: emp.id } },
            });
            if (existing) { skipped++; continue; }

            const monthlySalary = Number(emp.monthlySalary ?? 0);
            if (monthlySalary <= 0) { skipped++; continue; }

            // Allowance snapshot.
            const allowanceTotal = round2(emp.allowances.reduce((s, a) => s + Number(a.amount), 0));

            // Proration — count ABSENT days in period (no record at all OR explicit ABSENT).
            // We only count records that are explicitly ABSENT; days with NO record are also
            // treated as ABSENT for proration. Simplest: count ABSENT records in range.
            const absentCount = await db.attendanceRecord.count({
                where: { employeeId: emp.id, workDate: { gte: periodStart, lte: periodEnd }, status: 'ABSENT' },
            });
            // Effective working days = number of Mon-Sat in the month.
            const effectiveDays = countMonToSat(periodStart, periodEnd);
            const dailyRateEquivalent = effectiveDays > 0 ? monthlySalary / effectiveDays : 0;
            const prorationDeduction = round2(dailyRateEquivalent * absentCount);

            const grossPay = round2(monthlySalary + allowanceTotal + 0 /* thrAmount=0 default */ - prorationDeduction);

            // BPJS snapshot.
            const bpjsDeduction = round2(Number(emp.bpjsEmployeeDeduction ?? 0));

            // Loan deduction — auto from active loans.
            let loanDeduction = 0;
            for (const loan of emp.loans) {
                loanDeduction += EmployeeLoanService.nextDeductionAmount({
                    repaymentType: loan.repaymentType,
                    installmentAmount: loan.installmentAmount,
                    remainingBalance: loan.remainingBalance,
                });
            }
            loanDeduction = round2(loanDeduction);

            const otherDeductions = 0;
            const deductionTotal = round2(bpjsDeduction + loanDeduction + otherDeductions);
            const netPay = round2(grossPay - deductionTotal);

            await db.payslip.create({
                data: {
                    payrollPeriodId: period.id,
                    employeeId: emp.id,
                    baseSalary: monthlySalary,
                    allowanceTotal,
                    thrAmount: 0,
                    prorationDeduction,
                    grossPay,
                    bpjsDeduction,
                    loanDeduction,
                    otherDeductions,
                    deductionTotal,
                    netPay,
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
     * Finalize a single payslip:
     * - Status: DRAFT → FINALIZED
     * - Apply loan deduction: create EmployeeLoanPayment per active loan proportional to
     *   what was charged on this payslip, then decrement loan.remainingBalance.
     *   When remaining hits 0 → status = PAID_OFF.
     * - Best-effort: if loanDeduction was overridden manually, apply it proportionally
     *   across active loans by remaining balance weighting.
     */
    async finalize(db: PrismaClient, payslipId: string) {
        const payslip = await db.payslip.findUnique({
            where: { id: payslipId },
            include: { employee: { include: { loans: { where: { status: 'ACTIVE' } } } } },
        });
        if (!payslip) throw new NotFoundError('Payslip tidak ditemukan');
        if (payslip.status !== 'DRAFT') throw new BusinessRuleError('Payslip sudah difinalize');

        return db.$transaction(async (tx) => {
            // Distribute loanDeduction across active loans weighted by remaining balance.
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
                        // Rounding remainder to last loan to avoid leftover cents.
                        amount = round2(deduction - allocated);
                    } else {
                        amount = round2((Number(loan.remainingBalance) / totalRemaining) * deduction);
                        allocated = round2(allocated + amount);
                    }
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

/**
 * Count Mon-Sat days in [start, end] inclusive (UTC). Effective working days for proration.
 * (Sundays excluded per local convention.)
 */
function countMonToSat(start: Date, end: Date): number {
    let count = 0;
    const d = new Date(start);
    while (d <= end) {
        const day = d.getUTCDay(); // 0=Sun, 6=Sat
        if (day !== 0) count++;
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return count;
}
