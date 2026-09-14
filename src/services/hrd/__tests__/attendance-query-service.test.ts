import { describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { AttendanceService, type ListFilters } from '../attendance-service';

// Characterizes the real facade/projector, before and after query extraction.
// Only the caller-supplied Prisma boundary is stubbed; no client is constructed.
type AttendanceRow = Prisma.AttendanceRecordGetPayload<{
    include: {
        employee: { select: { name: true; code: true } };
        workShift: true;
    };
}>;
type MonthlyRow = Pick<AttendanceRow,
    'employeeId' | 'employee' | 'workDate' | 'status' | 'actualHours' | 'overtimeHours'
>;

const date = new Date('2024-02-28T00:00:00.000Z');
const from = new Date('2024-02-26T00:00:00.000Z');
const to = new Date('2024-02-29T00:00:00.000Z');
const dec = (value: number) => new Prisma.Decimal(value);
const include = {
    employee: { select: { name: true, code: true } },
    workShift: true,
};

function row(overrides: Partial<AttendanceRow> = {}): AttendanceRow {
    return {
        id: 'record-a', employeeId: 'employee-a', workDate: date,
        workShiftId: 'shift-a', status: 'PRESENT', source: 'KIOSK',
        clockInAt: new Date('2024-02-28T00:00:00.000Z'),
        clockOutAt: new Date('2024-02-28T08:00:00.000Z'),
        isOvertimeShift: false, plannedHours: dec(8), actualHours: dec(8),
        regularHours: dec(8), overtimeHours: dec(0), standardDayHours: dec(8),
        dailyRateSnapshot: dec(80.13), overtimeRateSnapshot: dec(15.37),
        dailyEarnings: dec(80.13), overtimeEarnings: dec(0), totalEarnings: dec(80.13),
        notes: null, createdById: null, createdAt: date, updatedAt: date,
        clockInPhotoUrl: null, clockOutPhotoUrl: null,
        clockInLatitude: null, clockInLongitude: null,
        clockInAccuracy: null, clockInDistance: null,
        clockOutLatitude: null, clockOutLongitude: null,
        clockOutAccuracy: null, clockOutDistance: null,
        employee: { name: 'Synthetic Alpha', code: 'SYN-A' },
        workShift: {
            id: 'shift-a', name: 'Synthetic day shift',
            startTime: '07:00', endTime: '15:00', plannedHours: null,
            status: 'ACTIVE', createdAt: date, updatedAt: date,
        },
        ...overrides,
    };
}

function openRow(overrides: Partial<AttendanceRow> = {}): AttendanceRow {
    return row({
        clockOutAt: null, actualHours: null, regularHours: null,
        overtimeHours: null, dailyEarnings: null, overtimeEarnings: null,
        totalEarnings: null, ...overrides,
    });
}

function createDb(rows: MonthlyRow[] = []) {
    const findMany = vi.fn<(args: Prisma.AttendanceRecordFindManyArgs) => Promise<MonthlyRow[]>>()
        .mockResolvedValue(rows);
    // The cast is confined to the DB boundary, not the fixtures or subject.
    const db = { attendanceRecord: { findMany } } as unknown as PrismaClient;
    return { db, findMany };
}

const listQueries = [
    {
        name: 'listByDate',
        run: (db: PrismaClient, filters?: ListFilters) => AttendanceService.listByDate(db, date, filters),
        where: { workDate: date },
        orderBy: [{ employee: { code: 'asc' } }, { clockInAt: 'asc' }],
    },
    {
        name: 'listByRange',
        run: (db: PrismaClient, filters?: ListFilters) => AttendanceService.listByRange(db, from, to, filters),
        where: { workDate: { gte: from, lte: to } },
        orderBy: [{ employee: { code: 'asc' } }, { workDate: 'asc' }, { clockInAt: 'asc' }],
    },
];

const queryCalls = [
    ...listQueries,
    { name: 'getSummary', run: (db: PrismaClient) => AttendanceService.getSummary(db, date) },
    { name: 'getWeeklySummary', run: (db: PrismaClient) => AttendanceService.getWeeklySummary(db, from, to) },
    { name: 'listByEmployee', run: (db: PrismaClient) => AttendanceService.listByEmployee(db, 'employee-a', from, to) },
    { name: 'getMonthlySummary', run: (db: PrismaClient) => AttendanceService.getMonthlySummary(db, 2024, 2) },
];

function summaryRows() {
    return [
        row({ id: 'long', clockOutAt: new Date('2024-02-28T08:20:00.000Z') }),
        row({ id: 'short', isOvertimeShift: true, clockOutAt: new Date('2024-02-28T01:00:00.000Z') }),
        openRow({ id: 'third', isOvertimeShift: true }),
        openRow({
            id: 'open', employeeId: 'employee-b', isOvertimeShift: true,
            employee: { name: 'Synthetic Beta', code: 'SYN-B' },
            actualHours: dec(99), overtimeHours: dec(0.105),
            dailyEarnings: dec(0.105), overtimeEarnings: dec(0.205),
        }),
    ];
}

const emptySummary = {
    date, totalEmployees: 0, totalRecords: 0, multiShiftCount: 0,
    totalActualHours: 0, totalOvertimeHours: 0, totalDailyEarnings: 0,
    totalOvertimeEarnings: 0, totalEarnings: 0, records: [],
};

describe('AttendanceService query characterization', () => {
    describe.each(listQueries)('$name', ({ run, where, orderBy }) => {
        it('preserves exact predicates/include/order and DB result order without filtering statuses', async () => {
            const { db, findMany } = createDb([
                row({ id: 'second', status: 'ABSENT' }), row({ id: 'first', status: 'ON_LEAVE' }),
            ]);
            const result = await run(db);
            expect(findMany).toHaveBeenCalledExactlyOnceWith({ where, include, orderBy });
            expect(result.map((r) => [r.id, r.status])).toEqual([
                ['second', 'ABSENT'], ['first', 'ON_LEAVE'],
            ]);
        });

        it('ignores empty shift and false overtime filters', async () => {
            const { db, findMany } = createDb([row()]);
            expect(await run(db, { workShiftId: '', overtimeOnly: false })).toHaveLength(1);
            expect(findMany).toHaveBeenCalledExactlyOnceWith({ where, include, orderBy });
        });

        it('filters after projection by overtime flag OR computed hours, with shift only in SQL', async () => {
            const { db, findMany } = createDb([
                row({ id: 'regular', overtimeHours: dec(99) }),
                row({ id: 'flagged', isOvertimeShift: true }),
                row({ id: 'computed', clockOutAt: new Date('2024-02-28T09:00:00.000Z') }),
                openRow({ id: 'stored', overtimeHours: dec(0.25) }),
                openRow({ id: 'null-hours' }),
            ]);
            const result = await run(db, { workShiftId: 'shift-a', overtimeOnly: true });
            expect(findMany).toHaveBeenCalledExactlyOnceWith({
                where: { ...where, workShiftId: 'shift-a' }, include, orderBy,
            });
            expect(result.map((r) => r.id)).toEqual(['flagged', 'computed', 'stored']);
            expect(result.map((r) => r.overtimeHours)).toEqual([0, 1, 0.25]);
        });
    });

    it('passes date/range objects through without normalizing or widening them', async () => {
        const { db, findMany } = createDb();
        const instant = new Date('2024-02-28T12:34:56.789Z');
        await AttendanceService.listByDate(db, instant);
        expect(findMany.mock.calls[0][0].where?.workDate).toBe(instant);
        await AttendanceService.listByRange(db, from, to);
        const range = findMany.mock.calls[1][0].where?.workDate;
        expect(range).toEqual({ gte: from, lte: to });
        expect(range).toHaveProperty('gte', from);
        expect(range).toHaveProperty('lte', to);
    });

    it('keeps employee scoping, inclusive range, descending order and the real projector', async () => {
        const { db, findMany } = createDb([row({
            plannedHours: dec(99), actualHours: dec(99), regularHours: dec(99),
            overtimeHours: dec(99), dailyEarnings: dec(999),
            overtimeEarnings: dec(999), totalEarnings: dec(999),
            clockOutAt: new Date('2024-02-28T09:20:00.000Z'),
            clockInLatitude: dec(-6.1), clockOutDistance: dec(12.34),
        })]);
        const [result] = await AttendanceService.listByEmployee(db, 'employee-a', from, to);
        expect(findMany).toHaveBeenCalledExactlyOnceWith({
            where: { employeeId: 'employee-a', workDate: { gte: from, lte: to } },
            include, orderBy: [{ workDate: 'desc' }, { clockInAt: 'desc' }],
        });
        expect(result).toEqual({
            id: 'record-a', employeeId: 'employee-a', employeeName: 'Synthetic Alpha', employeeCode: 'SYN-A',
            workDate: date, workShiftId: 'shift-a', shiftName: 'Synthetic day shift',
            clockInAt: new Date('2024-02-28T00:00:00.000Z'), clockOutAt: new Date('2024-02-28T09:20:00.000Z'),
            isOvertimeShift: false, plannedHours: 8, actualHours: 9.33, overtimeHours: 1.33, regularHours: 8,
            status: 'PRESENT', source: 'KIOSK', dailyRateSnapshot: 80.13, overtimeRateSnapshot: 15.37,
            dailyEarnings: 80.13, overtimeEarnings: 20.44, totalEarnings: 100.57,
            clockInPhotoUrl: null, clockOutPhotoUrl: null, clockInLatitude: -6.1, clockInLongitude: null,
            clockInAccuracy: null, clockInDistance: null, clockOutLatitude: null, clockOutLongitude: null,
            clockOutAccuracy: null, clockOutDistance: 12.34,
        });
    });

    it('retains snapshot fallback rates, partial pay, explicit planned hours and open/null hour semantics', async () => {
        const base = row();
        const { db } = createDb([
            row({ dailyRateSnapshot: dec(80), overtimeRateSnapshot: null, standardDayHours: null,
                clockOutAt: new Date('2024-02-28T10:00:00.000Z') }),
            row({ clockOutAt: new Date('2024-02-28T03:00:00.000Z') }),
            row({ workShift: { ...base.workShift, plannedHours: dec(6) } }),
            openRow({ regularHours: dec(2), overtimeHours: dec(0.5), dailyEarnings: dec(20),
                overtimeEarnings: dec(5), totalEarnings: dec(999) }),
            openRow({ clockInAt: null, dailyRateSnapshot: null, overtimeRateSnapshot: null }),
        ]);
        const results = await AttendanceService.listByEmployee(db, 'employee-a', from, to);
        expect(results[0]).toMatchObject({ overtimeRateSnapshot: 15, actualHours: 10, totalEarnings: 110 });
        expect(results[1]).toMatchObject({ actualHours: 3, dailyEarnings: 30.05, totalEarnings: 30.05 });
        expect(results[2]).toMatchObject({ plannedHours: 6, regularHours: 6, overtimeHours: 2,
            dailyEarnings: 60.1, overtimeEarnings: 30.74, totalEarnings: 90.84 });
        expect(results[3]).toMatchObject({ actualHours: null, regularHours: 2, overtimeHours: 0.5, totalEarnings: 25 });
        expect(results[4]).toMatchObject({ actualHours: null, regularHours: 0, overtimeHours: 0,
            dailyRateSnapshot: 0, overtimeRateSnapshot: 0, totalEarnings: 0 });
    });

    it('daily summary uses PRESENT, unique employees/flagged employees and two-decimal aggregate rounding', async () => {
        const { db, findMany } = createDb(summaryRows());
        const result = await AttendanceService.getSummary(db, date);
        expect(findMany).toHaveBeenCalledExactlyOnceWith({
            where: { workDate: date, status: 'PRESENT' }, include,
            orderBy: [{ employee: { code: 'asc' } }, { clockInAt: 'asc' }],
        });
        expect(result).toEqual({
            date, totalEmployees: 2, totalRecords: 4, multiShiftCount: 2,
            totalActualHours: 9.33, totalOvertimeHours: 0.44,
            totalDailyEarnings: 90.26, totalOvertimeEarnings: 5.28, totalEarnings: 95.53,
            records: expect.arrayContaining([expect.objectContaining({ id: 'open', actualHours: null })]),
        });
        expect(result.date).toBe(date);
        expect(result.records.map((r) => r.id)).toEqual(['long', 'short', 'third', 'open']);
    });

    it('weekly summary counts PRESENT records, not unique dates, and preserves first-seen employee order', async () => {
        const rows = summaryRows();
        const { db, findMany } = createDb([rows[3], ...rows.slice(0, 3)]);
        const result = await AttendanceService.getWeeklySummary(db, from, to);
        expect(findMany).toHaveBeenCalledExactlyOnceWith({
            where: { workDate: { gte: from, lte: to }, status: 'PRESENT' }, include,
        });
        expect(result).toEqual([
            { employeeId: 'employee-b', employeeCode: 'SYN-B', employeeName: 'Synthetic Beta', daysPresent: 1,
                totalActualHours: 0, totalOvertimeHours: 0.11, totalDailyEarnings: 0.11,
                totalOvertimeEarnings: 0.21, totalEarnings: 0.31 },
            { employeeId: 'employee-a', employeeCode: 'SYN-A', employeeName: 'Synthetic Alpha', daysPresent: 3,
                totalActualHours: 9.33, totalOvertimeHours: 0.33, totalDailyEarnings: 90.15,
                totalOvertimeEarnings: 5.07, totalEarnings: 95.22 },
        ]);
    });

    it.each([
        [2024, 2, '2024-02-01', '2024-02-29'],
        [2025, 2, '2025-02-01', '2025-02-28'],
        [2024, 12, '2024-12-01', '2024-12-31'],
    ])('monthly query uses UTC calendar month %i/%i including leap February', async (year, month, start, end) => {
        const { db, findMany } = createDb();
        await AttendanceService.getMonthlySummary(db, Number(year), Number(month));
        expect(findMany).toHaveBeenCalledExactlyOnceWith({
            where: { workDate: { gte: new Date(`${start}T00:00:00.000Z`), lte: new Date(`${end}T00:00:00.000Z`) } },
            select: {
                employeeId: true, workDate: true, status: true, actualHours: true, overtimeHours: true,
                employee: { select: { name: true, code: true } },
            },
            orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
        });
    });

    it('monthly counts unique dates per status, all-status multi-shifts and stored PRESENT hours only', async () => {
        const base: MonthlyRow = {
            employeeId: 'employee-a', employee: { name: 'Synthetic Alpha', code: 'SYN-A' },
            workDate: date, status: 'PRESENT', actualHours: dec(1.005), overtimeHours: dec(0.105),
        };
        const nextDate = new Date('2024-02-29T00:00:00.000Z');
        const { db } = createDb([
            base, { ...base }, // same PRESENT day, counted once but hours summed
            { ...base, status: 'ABSENT', actualHours: dec(99), overtimeHours: dec(99) },
            { ...base, status: 'ABSENT' }, // same day can belong to multiple status sets
            { ...base, workDate: nextDate, status: 'ON_LEAVE' },
            { ...base, workDate: nextDate, status: 'ON_LEAVE' }, // non-present multi-shift still counted
            { ...base, workDate: nextDate, actualHours: null, overtimeHours: null },
            { ...base, actualHours: dec(0), overtimeHours: dec(0) },
            { ...base, workDate: new Date('2024-02-27'), status: 'ABSENT' },
            { ...base, workDate: new Date('2024-02-27'), status: 'ABSENT' }, // exclusively non-present multi-shift
            { ...base, employeeId: 'employee-b', employee: { name: 'Synthetic Beta', code: 'SYN-B' },
                status: 'ON_LEAVE', actualHours: dec(99), overtimeHours: dec(99) },
        ]);
        expect(await AttendanceService.getMonthlySummary(db, 2024, 2)).toEqual([
            { employeeId: 'employee-a', employeeCode: 'SYN-A', employeeName: 'Synthetic Alpha',
                daysPresent: 2, daysAbsent: 2, daysOnLeave: 1, totalActualHours: 2.01,
                totalOvertimeHours: 0.21, multiShiftDays: 3 },
            { employeeId: 'employee-b', employeeCode: 'SYN-B', employeeName: 'Synthetic Beta',
                daysPresent: 0, daysAbsent: 0, daysOnLeave: 1, totalActualHours: 0,
                totalOvertimeHours: 0, multiShiftDays: 0 },
        ]);
    });

    describe.each(queryCalls)('$name boundary', ({ name, run }) => {
        it('returns the empty result without a fallback/global query', async () => {
            const { db, findMany } = createDb();
            expect(await run(db)).toEqual(name === 'getSummary' ? emptySummary : []);
            expect(findMany).toHaveBeenCalledTimes(1);
        });

        it('propagates the original DB rejection unchanged', async () => {
            const { db, findMany } = createDb();
            const failure = new Error('synthetic query rejection');
            findMany.mockRejectedValue(failure);
            await expect(run(db)).rejects.toBe(failure);
            expect(findMany).toHaveBeenCalledTimes(1);
        });

        it('uses each supplied DB independently, including interleaved calls', async () => {
            const a = createDb([row()]);
            const b = createDb([row({ employeeId: 'employee-b', employee: { name: 'Synthetic Beta', code: 'SYN-B' } })]);
            const [firstA, firstB, secondB, secondA] = await Promise.all([
                run(a.db), run(b.db), run(b.db), run(a.db),
            ]);
            for (const result of [firstA, secondA]) {
                expect(JSON.stringify(result)).toContain('"employeeId":"employee-a"');
                expect(JSON.stringify(result)).not.toContain('"employeeId":"employee-b"');
            }
            for (const result of [firstB, secondB]) {
                expect(JSON.stringify(result)).toContain('"employeeId":"employee-b"');
                expect(JSON.stringify(result)).not.toContain('"employeeId":"employee-a"');
            }
            expect(a.findMany).toHaveBeenCalledTimes(2);
            expect(b.findMany).toHaveBeenCalledTimes(2);
        });
    });
});
