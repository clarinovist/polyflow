/**
 * Draft payslip generation for a payroll period (runs inside the caller's transaction).
 */

import type { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import {
    basisFromSources,
    computeAttendanceProration,
    loadAttendanceSources,
    periodBounds,
    todayWibDate,
    type AttendanceBasis,
    type AttendanceSources,
    type PeriodBounds,
} from './payroll-attendance-basis';
import {
    computePayslipAmounts,
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

interface DraftContext {
    periodId: string;
    year: number;
    month: number;
    bounds: PeriodBounds;
    today: Date;
    sources: AttendanceSources;
}

export interface DraftWarning {
    employeeId: string;
    employeeName: string;
    missingDays: number;
}

export interface GenerateDraftsResult {
    created: number;
    skipped: number;
    periodId: string;
    warnings: DraftWarning[];
}

interface BuiltDraft {
    data: Prisma.PayslipUncheckedCreateInput;
    warning: DraftWarning | null;
}

/** Draft payslip data (+ missing-attendance warning) for one employee, or null when it has no salary. */
function buildDraftPayslipData(
    emp: DraftEmployee,
    ctx: DraftContext,
): BuiltDraft | null {
    const monthlySalary = Number(emp.monthlySalary ?? 0);
    if (monthlySalary <= 0) return null;

    const allowanceTotal = round2(
        emp.allowances.reduce((s, a) => s + Number(a.amount), 0),
    );
    const basis = basisFromSources(ctx.sources, emp, ctx.bounds, ctx.today);
    const prorationDeduction = computeAttendanceProration(monthlySalary, basis);
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

    const data: Prisma.PayslipUncheckedCreateInput = {
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
    const warning =
        basis.missingDays > 0
            ? {
                  employeeId: emp.id,
                  employeeName: emp.name,
                  missingDays: basis.missingDays,
              }
            : null;
    return { data, warning };
}

/** Active MONTHLY employees, and those without a payslip yet in this period. */
async function loadDraftCandidates(tx: TxClient, periodId: string) {
    const employees = await tx.employee.findMany({
        where: { payType: 'MONTHLY', status: 'ACTIVE' },
        include: {
            allowances: { where: { isActive: true } },
            loans: { where: { status: 'ACTIVE' } },
        },
    });
    const existing = await tx.payslip.findMany({
        where: { payrollPeriodId: periodId },
        select: { employeeId: true },
    });
    const existingIds = new Set(existing.map((p) => p.employeeId));
    return {
        employees,
        candidates: employees.filter((e) => !existingIds.has(e.id)),
    };
}

export async function generateDraftsInTx(
    tx: TxClient,
    input: GeneratePayslipsInput,
    options?: PayrollTxOptions,
): Promise<GenerateDraftsResult> {
    const period = await upsertPeriod(tx, input.year, input.month);
    if (period.status === 'CLOSED') {
        throw new BusinessRuleError(
            `Periode ${input.year}-${String(input.month).padStart(2, '0')} sudah CLOSED`,
        );
    }

    const bounds = periodBounds(input.year, input.month);
    const { employees, candidates } = await loadDraftCandidates(tx, period.id);
    const sources = await loadSourcesFor(tx, candidates, bounds);

    const ctx: DraftContext = {
        periodId: period.id,
        year: input.year,
        month: input.month,
        bounds,
        today: todayWibDate(),
        sources,
    };
    const warnings: DraftWarning[] = [];
    let created = 0;
    for (const emp of candidates) {
        const built = buildDraftPayslipData(emp, ctx);
        if (!built) continue;
        await tx.payslip.create({ data: built.data });
        created++;
        if (built.warning) warnings.push(built.warning);
    }
    const skipped = employees.length - created;

    await runOnCommit(tx, options, {
        periodId: period.id,
        year: input.year,
        month: input.month,
        created,
        skipped,
        warningCount: warnings.length,
    });
    return { created, skipped, periodId: period.id, warnings };
}

/** Two set-based queries for all candidates; none when there is nobody to draft. */
async function loadSourcesFor(
    tx: TxClient,
    candidates: Array<{ id: string }>,
    bounds: PeriodBounds,
): Promise<AttendanceSources> {
    if (candidates.length === 0) {
        return { recordsByEmployee: new Map(), leavesByEmployee: new Map() };
    }
    return loadAttendanceSources(
        tx,
        candidates.map((e) => e.id),
        bounds,
    );
}

// ── Attendance basis of an existing payslip (read + DRAFT recompute) ──

const SLIP_BASIS_INCLUDE = {
    payrollPeriod: { select: { year: true, month: true } },
    employee: { select: { id: true, name: true, code: true, joinDate: true } },
} as const;

type SlipForBasis = Prisma.PayslipGetPayload<{
    include: typeof SLIP_BASIS_INCLUDE;
}>;

export interface PayslipAttendanceBasis extends AttendanceBasis {
    payslipId: string;
    employeeId: string;
    periodYear: number;
    periodMonth: number;
    dailyRate: number;
}

async function computeSlipBasis(
    client: TxClient,
    slip: SlipForBasis,
): Promise<AttendanceBasis> {
    const bounds = periodBounds(
        slip.payrollPeriod.year,
        slip.payrollPeriod.month,
    );
    const sources = await loadAttendanceSources(
        client,
        [slip.employeeId],
        bounds,
    );
    return basisFromSources(
        sources,
        { id: slip.employeeId, joinDate: slip.employee.joinDate },
        bounds,
        todayWibDate(),
    );
}

async function findSlipForBasis(
    client: TxClient,
    payslipId: string,
): Promise<SlipForBasis> {
    const slip = await client.payslip.findUnique({
        where: { id: payslipId },
        include: SLIP_BASIS_INCLUDE,
    });
    if (!slip) throw new NotFoundError('Payslip tidak ditemukan');
    return slip;
}

/** Read-only: attendance basis of a payslip as of the current attendance data. */
export async function readPayslipAttendanceBasis(
    client: TxClient,
    payslipId: string,
): Promise<PayslipAttendanceBasis> {
    const slip = await findSlipForBasis(client, payslipId);
    const basis = await computeSlipBasis(client, slip);
    const baseSalary = Number(slip.baseSalary);
    return {
        ...basis,
        payslipId: slip.id,
        employeeId: slip.employeeId,
        periodYear: slip.payrollPeriod.year,
        periodMonth: slip.payrollPeriod.month,
        dailyRate:
            basis.workingDays > 0 ? round2(baseSalary / basis.workingDays) : 0,
    };
}

/**
 * Recompute the attendance proration of a DRAFT payslip inside the caller's
 * transaction (the caller has already claimed the DRAFT row). Overwrites any manual
 * proration; every other component keeps its stored value.
 */
export async function recomputeProrationInTx(
    tx: TxClient,
    payslipId: string,
    options?: PayrollTxOptions,
) {
    const slip = await findSlipForBasis(tx, payslipId);
    const basis = await computeSlipBasis(tx, slip);
    const previousProration = Number(slip.prorationDeduction);
    const amounts = computePayslipAmounts({
        baseSalary: Number(slip.baseSalary),
        allowanceTotal: Number(slip.allowanceTotal),
        thrAmount: Number(slip.thrAmount),
        prorationDeduction: computeAttendanceProration(
            Number(slip.baseSalary),
            basis,
        ),
        bpjsDeduction: Number(slip.bpjsDeduction),
        loanDeduction: Number(slip.loanDeduction),
        otherDeductions: Number(slip.otherDeductions),
    });
    const updated = await tx.payslip.update({
        where: { id: payslipId },
        data: {
            prorationDeduction: amounts.prorationDeduction,
            grossPay: amounts.grossPay,
            deductionTotal: amounts.deductionTotal,
            netPay: amounts.netPay,
        },
    });
    await runOnCommit(tx, options, {
        employeeId: slip.employeeId,
        absentDays: basis.absentDays,
        deductibleLeaveDays: basis.deductibleLeaveDays,
        previousProration,
        prorationDeduction: amounts.prorationDeduction,
    });
    const { id, name, code } = slip.employee;
    return { ...updated, employee: { id, name, code } };
}
