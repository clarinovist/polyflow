/**
 * Attendance basis for monthly payroll proration (plan 3B).
 *
 * Per Mon–Sat date of the period, by priority:
 *  1. a record with clockInAt            → present, never deducted
 *  2. covered by APPROVED paid leave     → not deducted (wins over other overlapping leave)
 *  3. covered by APPROVED unpaid leave   → deducted 1 day
 *  4. an ABSENT record (deduped per date)→ deducted 1 day
 *  5. no record, no leave, date <= today (WIB) and >= joinDate → missing (warning only)
 * An ON_LEAVE record not covered by any APPROVED leave is paid and counted as unlinked.
 * Sundays are never counted. Dates are date-only values at UTC midnight (@db.Date).
 */

import type { LeaveType, Prisma } from '@prisma/client';
import { countMonToSat, round2 } from './payroll-monthly-math';
import { wibDateFrom } from './shift-window';

type DbClient = Prisma.TransactionClient;

export const PAID_LEAVE_TYPES: readonly LeaveType[] = [
    'ANNUAL',
    'SICK',
    'MATERNITY',
];
export const DEDUCTIBLE_LEAVE_TYPES: readonly LeaveType[] = [
    'PERMISSION',
    'UNPAID',
    'OTHER',
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SUNDAY = 0;

export interface AttendanceRecordInput {
    workDate: Date;
    status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE';
    clockInAt: Date | null;
}

export interface ApprovedLeaveInput {
    type: LeaveType;
    startDate: Date;
    endDate: Date;
}

export interface AttendanceBasisInput {
    periodStart: Date;
    periodEnd: Date;
    /** Today's WIB calendar date at UTC midnight. */
    today: Date;
    joinDate: Date | null;
    records: readonly AttendanceRecordInput[];
    leaves: readonly ApprovedLeaveInput[];
}

export interface AttendanceBasis {
    workingDays: number;
    absentDays: number;
    deductibleLeaveDays: number;
    paidLeaveDays: number;
    missingDays: number;
    unlinkedLeaveDays: number;
}

interface DayRecordFlags {
    hasClockIn: boolean;
    hasAbsent: boolean;
    hasOnLeave: boolean;
}

const dateKey = (date: Date): number => date.getTime();

function indexRecordsByDate(
    records: readonly AttendanceRecordInput[],
): Map<number, DayRecordFlags> {
    const byDate = new Map<number, DayRecordFlags>();
    for (const r of records) {
        const key = dateKey(r.workDate);
        const prev = byDate.get(key) ?? {
            hasClockIn: false,
            hasAbsent: false,
            hasOnLeave: false,
        };
        byDate.set(key, {
            hasClockIn: prev.hasClockIn || r.clockInAt !== null,
            hasAbsent: prev.hasAbsent || r.status === 'ABSENT',
            hasOnLeave: prev.hasOnLeave || r.status === 'ON_LEAVE',
        });
    }
    return byDate;
}

function coveringLeaveTypes(
    leaves: readonly ApprovedLeaveInput[],
    day: Date,
): LeaveType[] {
    return leaves
        .filter((l) => l.startDate <= day && day <= l.endDate)
        .map((l) => l.type);
}

type DayOutcome =
    | 'present'
    | 'paidLeave'
    | 'deductibleLeave'
    | 'absent'
    | 'unlinkedLeave'
    | 'missing'
    | 'none';

function classifyDay(
    day: Date,
    flags: DayRecordFlags | undefined,
    leaveTypes: readonly LeaveType[],
    isMissingEligible: boolean,
): DayOutcome {
    if (flags?.hasClockIn) return 'present';
    if (leaveTypes.some((t) => PAID_LEAVE_TYPES.includes(t)))
        return 'paidLeave';
    if (leaveTypes.some((t) => DEDUCTIBLE_LEAVE_TYPES.includes(t)))
        return 'deductibleLeave';
    if (flags?.hasAbsent) return 'absent';
    if (flags?.hasOnLeave) return 'unlinkedLeave';
    if (!flags && isMissingEligible) return 'missing';
    return 'none';
}

/** Pure: classifies every Mon–Sat date of the period. No DB access. */
export function computeAttendanceBasis(
    input: AttendanceBasisInput,
): AttendanceBasis {
    const recordsByDate = indexRecordsByDate(input.records);
    const joinTime = input.joinDate ? dateKey(input.joinDate) : -Infinity;
    const counts: Record<DayOutcome, number> = {
        present: 0,
        paidLeave: 0,
        deductibleLeave: 0,
        absent: 0,
        unlinkedLeave: 0,
        missing: 0,
        none: 0,
    };

    for (
        let t = dateKey(input.periodStart);
        t <= dateKey(input.periodEnd);
        t += MS_PER_DAY
    ) {
        const day = new Date(t);
        if (day.getUTCDay() === SUNDAY) continue;
        const isMissingEligible = t <= dateKey(input.today) && t >= joinTime;
        const outcome = classifyDay(
            day,
            recordsByDate.get(t),
            coveringLeaveTypes(input.leaves, day),
            isMissingEligible,
        );
        counts[outcome] += 1;
    }

    return {
        workingDays: countMonToSat(input.periodStart, input.periodEnd),
        absentDays: counts.absent,
        deductibleLeaveDays: counts.deductibleLeave,
        paidLeaveDays: counts.paidLeave,
        missingDays: counts.missing,
        unlinkedLeaveDays: counts.unlinkedLeave,
    };
}

/** round2(monthlySalary ÷ workingDays × (absent + deductible leave days)). */
export function computeAttendanceProration(
    monthlySalary: number,
    basis: Pick<
        AttendanceBasis,
        'workingDays' | 'absentDays' | 'deductibleLeaveDays'
    >,
): number {
    if (basis.workingDays <= 0) return 0;
    const dailyRate = monthlySalary / basis.workingDays;
    return round2(dailyRate * (basis.absentDays + basis.deductibleLeaveDays));
}

// ── DB loading (set-based: one query for records, one for leaves) ──

export interface PeriodBounds {
    periodStart: Date;
    periodEnd: Date;
}

export function periodBounds(year: number, month: number): PeriodBounds {
    return {
        periodStart: new Date(Date.UTC(year, month - 1, 1)),
        periodEnd: new Date(Date.UTC(year, month, 0)),
    };
}

/** Today's WIB calendar date at UTC midnight (reuses the shift-window helper). */
export function todayWibDate(): Date {
    return wibDateFrom(new Date());
}

/** joinDate is a plain DateTime: normalise it to its WIB calendar date. */
export function joinDateToWibDate(joinDate: Date | null): Date | null {
    return joinDate ? wibDateFrom(joinDate) : null;
}

export interface AttendanceSources {
    recordsByEmployee: Map<string, AttendanceRecordInput[]>;
    leavesByEmployee: Map<string, ApprovedLeaveInput[]>;
}

function groupByEmployee<T extends { employeeId: string }>(
    rows: readonly T[],
): Map<string, T[]> {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
        grouped.set(row.employeeId, [
            ...(grouped.get(row.employeeId) ?? []),
            row,
        ]);
    }
    return grouped;
}

/** Exactly two queries, regardless of how many employees. */
export async function loadAttendanceSources(
    client: DbClient,
    employeeIds: string[],
    bounds: PeriodBounds,
): Promise<AttendanceSources> {
    const records = await client.attendanceRecord.findMany({
        where: {
            employeeId: { in: employeeIds },
            workDate: { gte: bounds.periodStart, lte: bounds.periodEnd },
        },
        select: {
            employeeId: true,
            workDate: true,
            status: true,
            clockInAt: true,
        },
    });
    const leaves = await client.leaveRequest.findMany({
        where: {
            employeeId: { in: employeeIds },
            status: 'APPROVED',
            startDate: { lte: bounds.periodEnd },
            endDate: { gte: bounds.periodStart },
        },
        select: {
            employeeId: true,
            type: true,
            startDate: true,
            endDate: true,
        },
    });
    return {
        recordsByEmployee: groupByEmployee(records),
        leavesByEmployee: groupByEmployee(leaves),
    };
}

/** Basis for one employee from preloaded sources. */
export function basisFromSources(
    sources: AttendanceSources,
    employee: { id: string; joinDate: Date | null },
    bounds: PeriodBounds,
    today: Date,
): AttendanceBasis {
    return computeAttendanceBasis({
        ...bounds,
        today,
        joinDate: joinDateToWibDate(employee.joinDate),
        records: sources.recordsByEmployee.get(employee.id) ?? [],
        leaves: sources.leavesByEmployee.get(employee.id) ?? [],
    });
}
