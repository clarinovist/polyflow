import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { PayrollMonthlyService } from '../payroll-monthly-service';

function dec(n: number) {
    return { toNumber: () => n, valueOf: () => n, toString: () => String(n) } as any;
}

// Juni 2026: 1 Juni = Senin; Minggu = 7, 14, 21, 28 → 26 hari Senin–Sabtu.
const june = (d: number) => new Date(Date.UTC(2026, 5, d));
const TODAY_AFTER_JUNE = new Date('2026-07-05T03:00:00.000Z');

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(TODAY_AFTER_JUNE);
});
afterEach(() => {
    vi.useRealTimers();
});

const present = (employeeId: string, d: number) => ({
    employeeId,
    workDate: june(d),
    status: 'PRESENT',
    clockInAt: new Date(Date.UTC(2026, 5, d, 1)),
});
const absent = (employeeId: string, d: number) => ({
    employeeId,
    workDate: june(d),
    status: 'ABSENT',
    clockInAt: null,
});

/** Catatan hadir untuk semua Senin–Sabtu Juni 2026 kecuali tanggal di `skip`. */
function fullMonthPresent(employeeId: string, skip: number[] = []) {
    const rows = [];
    for (let d = 1; d <= 30; d++) {
        if (skip.includes(d) || june(d).getUTCDay() === 0) continue;
        rows.push(present(employeeId, d));
    }
    return rows;
}

const emp = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    name: `Karyawan ${id}`,
    monthlySalary: dec(3_000_000),
    joinDate: null,
    bpjsParticipant: false,
    bpjsEmployeeDeduction: null,
    allowances: [],
    loans: [],
    ...over,
});

// ─── generateDrafts ─────────────────────────────────

function makeGenerateDb() {
    const tx = {
        payrollPeriod: { upsert: vi.fn() },
        employee: { findMany: vi.fn() },
        payslip: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
        attendanceRecord: { findMany: vi.fn(), count: vi.fn() },
        leaveRequest: { findMany: vi.fn() },
    };
    const db = {
        $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    tx.payrollPeriod.upsert.mockResolvedValue({
        id: 'period-1',
        year: 2026,
        month: 6,
        status: 'OPEN',
    });
    tx.payslip.findMany.mockResolvedValue([]);
    tx.payslip.create.mockResolvedValue({ id: 'ps' });
    tx.attendanceRecord.findMany.mockResolvedValue([]);
    tx.leaveRequest.findMany.mockResolvedValue([]);
    return { tx, db };
}

const JUNE = { year: 2026, month: 6 };

describe('PayrollMonthlyService.generateDrafts — attendance-based proration', () => {
    it('loads attendance and leave with one query each for all employees (no per-employee queries)', async () => {
        const { db, tx } = makeGenerateDb();
        tx.employee.findMany.mockResolvedValue([emp('e1'), emp('e2'), emp('e3')]);

        const result = await PayrollMonthlyService.generateDrafts(db as any, JUNE);

        expect(result.created).toBe(3);
        expect(tx.attendanceRecord.findMany).toHaveBeenCalledTimes(1);
        expect(tx.leaveRequest.findMany).toHaveBeenCalledTimes(1);
        expect(tx.attendanceRecord.count).not.toHaveBeenCalled();
        expect(tx.payslip.findUnique).not.toHaveBeenCalled();

        const recordArgs = tx.attendanceRecord.findMany.mock.calls[0][0];
        expect(recordArgs.where.employeeId).toEqual({ in: ['e1', 'e2', 'e3'] });
        expect(recordArgs.where.workDate).toEqual({ gte: june(1), lte: june(30) });
        expect(recordArgs.select).toMatchObject({
            employeeId: true,
            workDate: true,
            status: true,
            clockInAt: true,
        });

        const leaveArgs = tx.leaveRequest.findMany.mock.calls[0][0];
        expect(leaveArgs.where.employeeId).toEqual({ in: ['e1', 'e2', 'e3'] });
        expect(leaveArgs.where.status).toBe('APPROVED');
        // overlap with the period: starts on/before period end, ends on/after period start
        expect(leaveArgs.where.startDate).toEqual({ lte: june(30) });
        expect(leaveArgs.where.endDate).toEqual({ gte: june(1) });
    });

    it('skips both queries when there is nobody to draft', async () => {
        const { db, tx } = makeGenerateDb();
        tx.employee.findMany.mockResolvedValue([emp('e1')]);
        tx.payslip.findMany.mockResolvedValue([{ employeeId: 'e1' }]);

        const result = await PayrollMonthlyService.generateDrafts(db as any, JUNE);

        expect(result).toEqual({
            created: 0,
            skipped: 1,
            periodId: 'period-1',
            warnings: [],
        });
        expect(tx.attendanceRecord.findMany).not.toHaveBeenCalled();
        expect(tx.leaveRequest.findMany).not.toHaveBeenCalled();
    });

    it('deducts alpa and unpaid-type leave, rounded: 3.000.000 / 26 x 3 days', async () => {
        const { db, tx } = makeGenerateDb();
        tx.employee.findMany.mockResolvedValue([emp('e1')]);
        tx.attendanceRecord.findMany.mockResolvedValue([
            ...fullMonthPresent('e1', [2, 3, 4]),
            absent('e1', 2),
        ]);
        tx.leaveRequest.findMany.mockResolvedValue([
            { employeeId: 'e1', type: 'PERMISSION', startDate: june(3), endDate: june(4) },
        ]);

        await PayrollMonthlyService.generateDrafts(db as any, JUNE);

        const data = tx.payslip.create.mock.calls[0][0].data;
        expect(data.prorationDeduction).toBe(346_153.85);
        expect(data.deductionTotal).toBe(346_153.85);
        expect(data.grossPay).toBe(3_000_000);
        expect(data.netPay).toBe(2_653_846.15);
    });

    it('does not deduct paid leave and does not deduct days with no record', async () => {
        const { db, tx } = makeGenerateDb();
        tx.employee.findMany.mockResolvedValue([emp('e1')]);
        tx.attendanceRecord.findMany.mockResolvedValue(
            fullMonthPresent('e1', [2, 3, 9]),
        );
        tx.leaveRequest.findMany.mockResolvedValue([
            { employeeId: 'e1', type: 'SICK', startDate: june(2), endDate: june(3) },
        ]);

        const result = await PayrollMonthlyService.generateDrafts(db as any, JUNE);

        expect(tx.payslip.create.mock.calls[0][0].data.prorationDeduction).toBe(0);
        // June 9 has no record and no leave -> warning only
        expect(result.warnings).toEqual([
            { employeeId: 'e1', employeeName: 'Karyawan e1', missingDays: 1 },
        ]);
    });

    it('attributes records and leaves to the right employee only', async () => {
        const { db, tx } = makeGenerateDb();
        tx.employee.findMany.mockResolvedValue([emp('e1'), emp('e2')]);
        tx.attendanceRecord.findMany.mockResolvedValue([
            ...fullMonthPresent('e1'),
            ...fullMonthPresent('e2', [8]),
            absent('e2', 8),
        ]);

        await PayrollMonthlyService.generateDrafts(db as any, JUNE);

        const prorations = tx.payslip.create.mock.calls.map(
            (c: any) => c[0].data.prorationDeduction,
        );
        expect(prorations).toEqual([0, 115_384.62]);
    });

    it('warnings list only employees with missing days and onCommit facts carry warningCount', async () => {
        const { db, tx } = makeGenerateDb();
        tx.employee.findMany.mockResolvedValue([emp('e1'), emp('e2')]);
        tx.attendanceRecord.findMany.mockResolvedValue([
            ...fullMonthPresent('e1'),
            ...fullMonthPresent('e2', [10, 11]),
        ]);
        const onCommit = vi.fn().mockResolvedValue(undefined);

        const result = await PayrollMonthlyService.generateDrafts(
            db as any,
            JUNE,
            { onCommit },
        );

        expect(result.warnings).toEqual([
            { employeeId: 'e2', employeeName: 'Karyawan e2', missingDays: 2 },
        ]);
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0][1]).toMatchObject({
            periodId: 'period-1',
            created: 2,
            skipped: 0,
            warningCount: 1,
        });
    });

    it('does not warn about dates after today or before the join date', async () => {
        const { db, tx } = makeGenerateDb();
        vi.setSystemTime(new Date('2026-06-10T03:00:00.000Z')); // Wed 10 Jun, WIB
        tx.employee.findMany.mockResolvedValue([
            emp('late', { joinDate: june(8) }),
        ]);
        // present on 8, 9 and 10 → nothing missing: 1-6 are before join, 11+ are in the future
        tx.attendanceRecord.findMany.mockResolvedValue([
            present('late', 8),
            present('late', 9),
            present('late', 10),
        ]);

        const result = await PayrollMonthlyService.generateDrafts(db as any, JUNE);

        expect(result.warnings).toEqual([]);
        expect(tx.payslip.create.mock.calls[0][0].data.prorationDeduction).toBe(0);
    });

    it('uses the WIB calendar date for "today"', async () => {
        const { db, tx } = makeGenerateDb();
        // 09 Jun 20:00 UTC = 10 Jun 03:00 WIB → today is Jun 10
        vi.setSystemTime(new Date('2026-06-09T20:00:00.000Z'));
        tx.employee.findMany.mockResolvedValue([emp('e1', { joinDate: june(10) })]);

        const result = await PayrollMonthlyService.generateDrafts(db as any, JUNE);

        expect(result.warnings).toEqual([
            { employeeId: 'e1', employeeName: 'Karyawan e1', missingDays: 1 },
        ]);
    });

    it('keeps no-salary employees out of created and out of warnings', async () => {
        const { db, tx } = makeGenerateDb();
        tx.employee.findMany.mockResolvedValue([
            emp('nosal', { monthlySalary: dec(0) }),
        ]);

        const result = await PayrollMonthlyService.generateDrafts(db as any, JUNE);

        expect(result).toEqual({
            created: 0,
            skipped: 1,
            periodId: 'period-1',
            warnings: [],
        });
        expect(tx.payslip.create).not.toHaveBeenCalled();
    });
});

// ─── recomputeDraftProration / getAttendanceBasis ───

function makeRecomputeDb() {
    const tx = {
        payslip: { updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
        attendanceRecord: { findMany: vi.fn() },
        leaveRequest: { findMany: vi.fn() },
    };
    const db = {
        $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
        payslip: tx.payslip,
        attendanceRecord: tx.attendanceRecord,
        leaveRequest: tx.leaveRequest,
    };
    tx.payslip.updateMany.mockResolvedValue({ count: 1 });
    tx.attendanceRecord.findMany.mockResolvedValue([]);
    tx.leaveRequest.findMany.mockResolvedValue([]);
    return { tx, db };
}

const draftSlip = (over: Record<string, unknown> = {}) => ({
    id: 'ps1',
    employeeId: 'e1',
    status: 'DRAFT',
    baseSalary: dec(3_000_000),
    allowanceTotal: dec(200_000),
    thrAmount: dec(100_000),
    prorationDeduction: dec(999_999),
    bpjsDeduction: dec(50_000),
    loanDeduction: dec(100_000),
    otherDeductions: dec(20_000),
    payrollPeriod: { year: 2026, month: 6 },
    employee: { id: 'e1', name: 'Karyawan e1', code: 'EMP-1', joinDate: null },
    ...over,
});

describe('PayrollMonthlyService.recomputeDraftProration', () => {
    function setup(slip = draftSlip()) {
        const ctx = makeRecomputeDb();
        ctx.tx.payslip.findUnique.mockResolvedValue(slip);
        ctx.tx.payslip.update.mockImplementation(async ({ data }: any) => ({
            ...slip,
            ...data,
        }));
        ctx.tx.attendanceRecord.findMany.mockResolvedValue([
            ...fullMonthPresent('e1', [2, 3]),
            absent('e1', 2),
            absent('e1', 2), // second shift, same date
        ]);
        ctx.tx.leaveRequest.findMany.mockResolvedValue([
            { employeeId: 'e1', type: 'UNPAID', startDate: june(3), endDate: june(3) },
        ]);
        return ctx;
    }

    it('claims the DRAFT slip atomically before reading it', async () => {
        const { db, tx } = setup();

        await PayrollMonthlyService.recomputeDraftProration(db as any, 'ps1');

        expect(tx.payslip.updateMany.mock.calls[0][0].where).toEqual({
            id: 'ps1',
            status: 'DRAFT',
        });
        expect(tx.payslip.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
            tx.payslip.findUnique.mock.invocationCallOrder[0],
        );
        expect(db.$transaction).toHaveBeenCalledTimes(1);
    });

    it('overwrites the manual proration and keeps gross/deduction/net consistent', async () => {
        const { db, tx } = setup();

        const result = await PayrollMonthlyService.recomputeDraftProration(
            db as any,
            'ps1',
        );

        // 2 days (alpa on 2 deduped, unpaid leave on 3): 3.000.000 / 26 x 2 = 230769.23
        const data = tx.payslip.update.mock.calls[0][0].data;
        expect(data.prorationDeduction).toBe(230_769.23);
        expect(data.grossPay).toBe(3_300_000); // base + allowance + thr
        expect(data.deductionTotal).toBe(400_769.23); // bpjs + loan + other + proration
        expect(data.netPay).toBe(2_899_230.77);
        expect(tx.payslip.update.mock.calls[0][0].where).toEqual({ id: 'ps1' });
        expect(result.employee).toEqual({
            id: 'e1',
            name: 'Karyawan e1',
            code: 'EMP-1',
        });
        expect(result.prorationDeduction).toBe(230_769.23);
    });

    it('rejects a non-DRAFT slip with the DRAFT-only message and writes nothing', async () => {
        const { db, tx } = setup();
        tx.payslip.updateMany.mockResolvedValue({ count: 0 });
        tx.payslip.findUnique.mockResolvedValue({ status: 'FINALIZED' });

        await expect(
            PayrollMonthlyService.recomputeDraftProration(db as any, 'ps1'),
        ).rejects.toThrow(
            new BusinessRuleError('Hanya payslip DRAFT yang bisa dihitung ulang'),
        );
        expect(tx.payslip.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the slip does not exist', async () => {
        const { db, tx } = setup();
        tx.payslip.updateMany.mockResolvedValue({ count: 0 });
        tx.payslip.findUnique.mockResolvedValue(null);

        await expect(
            PayrollMonthlyService.recomputeDraftProration(db as any, 'nope'),
        ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('calls onCommit inside the transaction after the update with the facts', async () => {
        const { db, tx } = setup();
        const onCommit = vi.fn().mockResolvedValue(undefined);

        await PayrollMonthlyService.recomputeDraftProration(db as any, 'ps1', {
            onCommit,
        });

        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit.mock.calls[0][0]).toBe(tx);
        expect(onCommit.mock.calls[0][1]).toEqual({
            employeeId: 'e1',
            absentDays: 1,
            deductibleLeaveDays: 1,
            previousProration: 999_999,
            prorationDeduction: 230_769.23,
        });
        expect(tx.payslip.update.mock.invocationCallOrder[0]).toBeLessThan(
            onCommit.mock.invocationCallOrder[0],
        );
    });

    it('rejects the whole recompute when onCommit fails', async () => {
        const { db } = setup();

        await expect(
            PayrollMonthlyService.recomputeDraftProration(db as any, 'ps1', {
                onCommit: vi.fn().mockRejectedValue(new Error('audit gagal')),
            }),
        ).rejects.toThrow('audit gagal');
    });

    it('limits the attendance and leave queries to the slip employee and its period', async () => {
        const { db, tx } = setup();

        await PayrollMonthlyService.recomputeDraftProration(db as any, 'ps1');

        const recordArgs = tx.attendanceRecord.findMany.mock.calls[0][0];
        expect(recordArgs.where.employeeId).toEqual({ in: ['e1'] });
        expect(recordArgs.where.workDate).toEqual({ gte: june(1), lte: june(30) });
        expect(tx.leaveRequest.findMany.mock.calls[0][0].where.status).toBe(
            'APPROVED',
        );
    });
});

describe('PayrollMonthlyService.getAttendanceBasis', () => {
    function setup(slip: Record<string, unknown> | null = draftSlip()) {
        const ctx = makeRecomputeDb();
        ctx.tx.payslip.findUnique.mockResolvedValue(slip);
        ctx.tx.attendanceRecord.findMany.mockResolvedValue([
            ...fullMonthPresent('e1', [2, 3, 9]),
            absent('e1', 2),
            onLeave('e1', 9),
        ]);
        ctx.tx.leaveRequest.findMany.mockResolvedValue([
            { employeeId: 'e1', type: 'ANNUAL', startDate: june(3), endDate: june(3) },
        ]);
        return ctx;
    }

    const onLeave = (employeeId: string, d: number) => ({
        employeeId,
        workDate: june(d),
        status: 'ON_LEAVE',
        clockInAt: null,
    });

    it('returns the contract shape and is read-only', async () => {
        const { db, tx } = setup();

        const result = await PayrollMonthlyService.getAttendanceBasis(
            db as any,
            'ps1',
        );

        expect(result).toEqual({
            payslipId: 'ps1',
            employeeId: 'e1',
            periodYear: 2026,
            periodMonth: 6,
            dailyRate: 115_384.62,
            workingDays: 26,
            absentDays: 1,
            deductibleLeaveDays: 0,
            paidLeaveDays: 1,
            missingDays: 0,
            unlinkedLeaveDays: 1,
        });
        expect(db.$transaction).not.toHaveBeenCalled();
        expect(tx.payslip.updateMany).not.toHaveBeenCalled();
        expect(tx.payslip.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for an unknown slip', async () => {
        const { db } = setup(null);

        await expect(
            PayrollMonthlyService.getAttendanceBasis(db as any, 'nope'),
        ).rejects.toBeInstanceOf(NotFoundError);
    });
});
