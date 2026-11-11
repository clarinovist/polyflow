/**
 * Draft payslip generation for a payroll period (runs inside the caller's transaction).
 */

import type { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import {
    computePayslipAmounts,
    countMonToSat,
    round2,
    sumLoanDeductions,
} from './payroll-monthly-math';
import { runOnCommit, type PayrollTxOptions } from './payroll-tx-options';

type TxClient = Prisma.TransactionClient;

export interface GeneratePayslipsInput {
    year: number;
    month: number; // 1-12
}

export async function upsertPeriod(
    client: TxClient,
    year: number,
    month: number,
) {
    if (month < 1 || month > 12)
        throw new BusinessRuleError('Bulan tidak valid (1-12)');
    return client.payrollPeriod.upsert({
        where: { year_month: { year, month } },
        create: { year, month, status: 'OPEN' },
        update: {},
    });
}

// ── generateDrafts helpers ──

type DraftEmployee = Prisma.EmployeeGetPayload<{
    include: { allowances: true; loans: true };
}>;

/** ABSENT records per employee in [start, end], in a single grouped query. */
async function loadAbsentCounts(
    tx: TxClient,
    employeeIds: string[],
    start: Date,
    end: Date,
): Promise<Map<string, number>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await tx.attendanceRecord.groupBy({
        by: ['employeeId'],
        where: {
            employeeId: { in: employeeIds },
            workDate: { gte: start, lte: end },
            status: 'ABSENT',
        },
        _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.employeeId, r._count._all]));
}

interface DraftContext {
    periodId: string;
    year: number;
    month: number;
    effectiveDays: number;
    absentCount: number;
}

/** Draft payslip data for one employee, or null when the employee has no salary. */
function buildDraftPayslipData(
    emp: DraftEmployee,
    ctx: DraftContext,
): Prisma.PayslipUncheckedCreateInput | null {
    const monthlySalary = Number(emp.monthlySalary ?? 0);
    if (monthlySalary <= 0) return null;

    const allowanceTotal = round2(
        emp.allowances.reduce((s, a) => s + Number(a.amount), 0),
    );
    const dailyRateEquivalent =
        ctx.effectiveDays > 0 ? monthlySalary / ctx.effectiveDays : 0;
    const prorationDeduction = round2(dailyRateEquivalent * ctx.absentCount);
    const bpjsDeduction = emp.bpjsParticipant
        ? round2(Number(emp.bpjsEmployeeDeduction ?? 0))
        : 0;
    const loanDeduction = sumLoanDeductions(emp.loans, ctx.year, ctx.month);

    const amounts = computePayslipAmounts({
        baseSalary: monthlySalary,
        allowanceTotal,
        thrAmount: 0,
        prorationDeduction,
        bpjsDeduction,
        loanDeduction,
        otherDeductions: 0,
    });

    return {
        payrollPeriodId: ctx.periodId,
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
            create: emp.allowances.map((a) => ({
                name: a.name,
                amount: Number(a.amount),
            })),
        },
    };
}

export async function generateDraftsInTx(
    tx: TxClient,
    input: GeneratePayslipsInput,
    options?: PayrollTxOptions,
): Promise<{ created: number; skipped: number; periodId: string }> {
    const period = await upsertPeriod(tx, input.year, input.month);
    if (period.status === 'CLOSED') {
        throw new BusinessRuleError(
            `Periode ${input.year}-${String(input.month).padStart(2, '0')} sudah CLOSED`,
        );
    }

    const periodStart = new Date(Date.UTC(input.year, input.month - 1, 1));
    const periodEnd = new Date(Date.UTC(input.year, input.month, 0));
    const effectiveDays = countMonToSat(periodStart, periodEnd);

    const employees = await tx.employee.findMany({
        where: { payType: 'MONTHLY', status: 'ACTIVE' },
        include: {
            allowances: { where: { isActive: true } },
            loans: { where: { status: 'ACTIVE' } },
        },
    });
    const existing = await tx.payslip.findMany({
        where: { payrollPeriodId: period.id },
        select: { employeeId: true },
    });
    const existingIds = new Set(existing.map((p) => p.employeeId));
    const candidates = employees.filter((e) => !existingIds.has(e.id));
    const absentCounts = await loadAbsentCounts(
        tx,
        candidates.map((e) => e.id),
        periodStart,
        periodEnd,
    );

    let created = 0;
    for (const emp of candidates) {
        const data = buildDraftPayslipData(emp, {
            periodId: period.id,
            year: input.year,
            month: input.month,
            effectiveDays,
            absentCount: absentCounts.get(emp.id) ?? 0,
        });
        if (!data) continue;
        await tx.payslip.create({ data });
        created++;
    }
    const skipped = employees.length - created;

    await runOnCommit(tx, options, {
        periodId: period.id,
        year: input.year,
        month: input.month,
        created,
        skipped,
    });
    return { created, skipped, periodId: period.id };
}
