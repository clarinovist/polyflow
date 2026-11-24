import { ValidationError } from '@/lib/errors/errors';
import { parseRosterDate } from './attendance-roster-service';
import {
    bestStatusPerEmployee,
    isLateRecord,
    type AttendanceTodayRecord,
} from './hrd-dashboard-attendance';
import { wibDateStringFrom } from './shift-window';

export const MAX_TREND_RANGE_DAYS = 92;
export const DEFAULT_TREND_RANGE_DAYS = 30;
export const TREND_RANGE_PRESETS = [7, 30, 90] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SUNDAY = 0;
const RATE_PRECISION = 10;

export interface AttendanceTrendRecordInput {
    employeeId: string;
    workDate: Date;
    status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE';
    clockInAt: Date | null;
    workShift: { startTime: string };
}

export interface EligibleEmployeeInput {
    id: string;
    joinDate: Date | null;
}

export interface AttendanceTrendDay {
    date: string;
    onTime: number;
    late: number;
    present: number;
    onLeave: number;
    absent: number;
    noRecord: number | null;
    eligibleHeadcount: number | null;
    attendanceRate: number | null;
}

export interface AttendanceTrendTotals {
    onTime: number;
    late: number;
    present: number;
    onLeave: number;
    absent: number;
    noRecord: number | null;
}

export interface AttendanceTrendResult {
    from: string;
    to: string;
    shiftFiltered: boolean;
    days: AttendanceTrendDay[];
    averageRate: number | null;
    totals: AttendanceTrendTotals;
}

export interface BuildAttendanceTrendInput {
    from: string;
    to: string;
    workShiftId?: string;
    records: readonly AttendanceTrendRecordInput[];
    eligible: readonly EligibleEmployeeInput[];
    graceMinutes: number;
}

/**
 * Validates `from` and `to` YYYY-MM-DD strings and enforces [1..92] day range.
 */
export function validateTrendRange(
    from: string,
    to: string,
): { fromDate: Date; toDate: Date } {
    const fromDate = parseRosterDate(from);
    const toDate = parseRosterDate(to);
    if (!fromDate || !toDate) {
        throw new ValidationError('Format tanggal tren tidak valid');
    }
    if (fromDate > toDate) {
        throw new ValidationError(
            'Tanggal mulai harus sebelum atau sama dengan tanggal akhir',
        );
    }
    const daySpan =
        Math.floor((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY) + 1;
    if (daySpan > MAX_TREND_RANGE_DAYS) {
        throw new ValidationError(
            `Rentang tren maksimal ${MAX_TREND_RANGE_DAYS} hari`,
        );
    }
    return { fromDate, toDate };
}

/** Computes inclusive [today - (days - 1), today] in YYYY-MM-DD. */
export function presetDateRange(
    days: number,
    todayWib: string,
): { from: string; to: string } {
    const end = new Date(`${todayWib}T00:00:00.000Z`);
    const start = new Date(end.getTime() - (days - 1) * MS_PER_DAY);
    return {
        from: start.toISOString().slice(0, 10),
        to: end.toISOString().slice(0, 10),
    };
}

function toTodayRecord(
    record: AttendanceTrendRecordInput,
): AttendanceTodayRecord {
    return {
        employeeId: record.employeeId,
        status: record.status,
        clockInAt: record.clockInAt,
        clockInDistance: null,
        clockInPhotoUrl: null,
        overtimeHours: 0,
        workShift: record.workShift,
    };
}

function groupByDateString(
    records: readonly AttendanceTrendRecordInput[],
): Map<string, AttendanceTodayRecord[]> {
    const grouped = new Map<string, AttendanceTodayRecord[]>();
    for (const r of records) {
        const dateStr = r.workDate.toISOString().slice(0, 10);
        const list = grouped.get(dateStr) ?? [];
        list.push(toTodayRecord(r));
        grouped.set(dateStr, list);
    }
    return grouped;
}

function roundRate(value: number): number {
    return Math.round(value * RATE_PRECISION) / RATE_PRECISION;
}

/**
 * Pure: aggregates daily team attendance trend across Mon–Sat working days.
 * Mutually exclusive bars: `onTime` + `late` === `present`.
 * When `workShiftId` is set, headcount/rate/noRecord are `null`.
 */
export function buildAttendanceTrend(
    input: BuildAttendanceTrendInput,
): AttendanceTrendResult {
    const { fromDate, toDate } = validateTrendRange(input.from, input.to);
    const shiftFiltered = Boolean(input.workShiftId);
    const recordsByDate = groupByDateString(input.records);
    const eligibleJoinDates = input.eligible.map((e) =>
        e.joinDate ? wibDateStringFrom(e.joinDate) : null,
    );

    const days: AttendanceTrendDay[] = [];
    const totals: AttendanceTrendTotals = {
        onTime: 0,
        late: 0,
        present: 0,
        onLeave: 0,
        absent: 0,
        noRecord: shiftFiltered ? null : 0,
    };
    let rateSum = 0;
    let rateCount = 0;

    for (
        let t = fromDate.getTime();
        t <= toDate.getTime();
        t += MS_PER_DAY
    ) {
        const day = new Date(t);
        if (day.getUTCDay() === SUNDAY) continue;

        const dateStr = day.toISOString().slice(0, 10);
        const dayRecords = recordsByDate.get(dateStr) ?? [];
        const statuses = bestStatusPerEmployee(dayRecords);

        let present = 0;
        let onLeave = 0;
        let absent = 0;
        for (const status of statuses.values()) {
            if (status === 'PRESENT') present += 1;
            else if (status === 'ON_LEAVE') onLeave += 1;
            else if (status === 'ABSENT') absent += 1;
        }

        const lateEmployees = new Set<string>();
        for (const r of dayRecords) {
            if (
                r.status === 'PRESENT' &&
                isLateRecord(r, dateStr, input.graceMinutes)
            ) {
                lateEmployees.add(r.employeeId);
            }
        }
        const late = lateEmployees.size;
        const onTime = Math.max(0, present - late);

        let eligibleHeadcount: number | null = null;
        let noRecord: number | null = null;
        let attendanceRate: number | null = null;

        if (!shiftFiltered) {
            eligibleHeadcount = eligibleJoinDates.filter(
                (jd) => jd === null || jd <= dateStr,
            ).length;
            noRecord = Math.max(0, eligibleHeadcount - statuses.size);
            if (eligibleHeadcount > 0) {
                attendanceRate = Math.min(
                    100,
                    roundRate((present / eligibleHeadcount) * 100),
                );
                rateSum += attendanceRate;
                rateCount += 1;
            }
            totals.noRecord = (totals.noRecord ?? 0) + noRecord;
        }

        totals.onTime += onTime;
        totals.late += late;
        totals.present += present;
        totals.onLeave += onLeave;
        totals.absent += absent;

        days.push({
            date: dateStr,
            onTime,
            late,
            present,
            onLeave,
            absent,
            noRecord,
            eligibleHeadcount,
            attendanceRate,
        });
    }

    return {
        from: input.from,
        to: input.to,
        shiftFiltered,
        days,
        averageRate: rateCount > 0 ? roundRate(rateSum / rateCount) : null,
        totals,
    };
}
