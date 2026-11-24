import {
    classifyDay,
    coveringLeaveTypes,
    indexRecordsByDate,
    periodBounds,
    type ApprovedLeaveInput,
    type AttendanceRecordInput,
    type DayOutcome,
} from './payroll-attendance-basis';
import { isLateForShift } from './shift-window';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SUNDAY = 0;
const SHORT_MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
] as const;

export type CalendarDayStatus =
    | 'present'
    | 'late'
    | 'paidLeave'
    | 'deductibleLeave'
    | 'absent'
    | 'unlinkedLeave'
    | 'missing'
    | 'sunday'
    | 'beforeJoin'
    | 'future';

export interface AttendanceDayRecordInput extends AttendanceRecordInput {
    workShiftId?: string;
    isLate?: boolean;
}

export interface DayOutcomeEntry {
    date: string;
    outcome: DayOutcome | null;
    status: CalendarDayStatus;
    isLate: boolean;
    hasRecord: boolean;
}

export interface MonthOutcomeSummary {
    workingDays: number;
    presentDays: number;
    onTimeDays: number;
    lateDays: number;
    absentDays: number;
    paidLeaveDays: number;
    deductibleLeaveDays: number;
    unlinkedLeaveDays: number;
    leaveDays: number;
    missingDays: number;
}

export interface EmployeeMonthlyTrendPoint {
    year: number;
    month: number;
    label: string;
    workingDays: number;
    onTimeDays: number;
    lateDays: number;
    presentDays: number;
    leaveDays: number;
    absentDays: number;
    missingDays: number;
}

export interface BuildDayOutcomesInput {
    periodStart: Date;
    periodEnd: Date;
    /** Today's WIB calendar date at UTC midnight. */
    today: Date;
    joinDate: Date | null;
    records: readonly AttendanceDayRecordInput[];
    leaves: readonly ApprovedLeaveInput[];
    shiftStartTimes?: ReadonlyMap<string, string>;
    graceMinutes?: number;
}

export interface BuildEmployeeTrendInput {
    endYear: number;
    endMonth: number;
    months: number;
    today: Date;
    joinDate: Date | null;
    records: readonly AttendanceDayRecordInput[];
    leaves: readonly ApprovedLeaveInput[];
    shiftStartTimes?: ReadonlyMap<string, string>;
    graceMinutes?: number;
}

function resolveLateFlag(
    record: AttendanceDayRecordInput,
    dateStr: string,
    shiftStartTimes: ReadonlyMap<string, string> | undefined,
    graceMinutes: number,
): boolean {
    if (record.isLate === true) return true;
    if (
        record.isLate === undefined &&
        record.status === 'PRESENT' &&
        record.clockInAt !== null &&
        record.workShiftId
    ) {
        const shiftStart = shiftStartTimes?.get(record.workShiftId);
        if (shiftStart) {
            return isLateForShift(
                record.clockInAt,
                dateStr,
                shiftStart,
                graceMinutes,
            );
        }
    }
    return false;
}

function collectDateFlags(
    records: readonly AttendanceDayRecordInput[],
    shiftStartTimes: ReadonlyMap<string, string> | undefined,
    graceMinutes: number,
) {
    const recordDates = new Set<number>();
    const lateByDate = new Map<number, boolean>();
    for (const r of records) {
        const t = r.workDate.getTime();
        recordDates.add(t);
        const dateStr = new Date(t).toISOString().slice(0, 10);
        if (resolveLateFlag(r, dateStr, shiftStartTimes, graceMinutes)) {
            lateByDate.set(t, true);
        }
    }
    return { recordDates, lateByDate };
}

/**
 * Pure: classifies every calendar day in [periodStart, periodEnd] using
 * `classifyDay` from payroll-attendance-basis so calendar/cards match payroll.
 */
export function buildDayOutcomes(input: BuildDayOutcomesInput): {
    days: DayOutcomeEntry[];
    summary: MonthOutcomeSummary;
} {
    const recordsByDate = indexRecordsByDate(input.records);
    const { recordDates, lateByDate } = collectDateFlags(
        input.records,
        input.shiftStartTimes,
        input.graceMinutes ?? 0,
    );
    const todayTime = input.today.getTime();
    const joinTime = input.joinDate ? input.joinDate.getTime() : -Infinity;

    const days: DayOutcomeEntry[] = [];
    const summary: MonthOutcomeSummary = {
        workingDays: 0,
        presentDays: 0,
        onTimeDays: 0,
        lateDays: 0,
        absentDays: 0,
        paidLeaveDays: 0,
        deductibleLeaveDays: 0,
        unlinkedLeaveDays: 0,
        leaveDays: 0,
        missingDays: 0,
    };

    for (
        let t = input.periodStart.getTime();
        t <= input.periodEnd.getTime();
        t += MS_PER_DAY
    ) {
        const day = new Date(t);
        const date = day.toISOString().slice(0, 10);
        const hasRecord = recordDates.has(t);

        if (day.getUTCDay() === SUNDAY) {
            days.push({
                date,
                outcome: null,
                status: 'sunday',
                isLate: false,
                hasRecord,
            });
            continue;
        }

        summary.workingDays += 1;
        const isMissingEligible = t <= todayTime && t >= joinTime;
        const outcome = classifyDay(
            day,
            recordsByDate.get(t),
            coveringLeaveTypes(input.leaves, day),
            isMissingEligible,
        );
        const dayIsLate =
            outcome === 'present' && (lateByDate.get(t) ?? false);

        let status: CalendarDayStatus;
        switch (outcome) {
            case 'present':
                status = dayIsLate ? 'late' : 'present';
                summary.presentDays += 1;
                if (dayIsLate) summary.lateDays += 1;
                else summary.onTimeDays += 1;
                break;
            case 'paidLeave':
                status = 'paidLeave';
                summary.paidLeaveDays += 1;
                break;
            case 'deductibleLeave':
                status = 'deductibleLeave';
                summary.deductibleLeaveDays += 1;
                break;
            case 'unlinkedLeave':
                status = 'unlinkedLeave';
                summary.unlinkedLeaveDays += 1;
                break;
            case 'absent':
                status = 'absent';
                summary.absentDays += 1;
                break;
            case 'missing':
                status = 'missing';
                summary.missingDays += 1;
                break;
            case 'none':
                status = t < joinTime ? 'beforeJoin' : 'future';
                break;
        }

        days.push({ date, outcome, status, isLate: dayIsLate, hasRecord });
    }

    summary.leaveDays =
        summary.paidLeaveDays +
        summary.deductibleLeaveDays +
        summary.unlinkedLeaveDays;

    return { days, summary };
}

function monthLabel(year: number, month: number): string {
    return `${SHORT_MONTHS[month - 1]} ${String(year).slice(-2)}`;
}

/**
 * Pure: builds chronological N-month attendance trend for a single employee
 * using `buildDayOutcomes` per month (mutually exclusive stacked counts).
 */
export function buildEmployeeMonthlyTrend(
    input: BuildEmployeeTrendInput,
): EmployeeMonthlyTrendPoint[] {
    const points: EmployeeMonthlyTrendPoint[] = [];
    for (let offset = input.months - 1; offset >= 0; offset -= 1) {
        const d = new Date(
            Date.UTC(input.endYear, input.endMonth - 1 - offset, 1),
        );
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth() + 1;
        const { periodStart, periodEnd } = periodBounds(year, month);
        const { summary } = buildDayOutcomes({
            periodStart,
            periodEnd,
            today: input.today,
            joinDate: input.joinDate,
            records: input.records,
            leaves: input.leaves,
            shiftStartTimes: input.shiftStartTimes,
            graceMinutes: input.graceMinutes,
        });
        points.push({
            year,
            month,
            label: monthLabel(year, month),
            workingDays: summary.workingDays,
            onTimeDays: summary.onTimeDays,
            lateDays: summary.lateDays,
            presentDays: summary.presentDays,
            leaveDays: summary.leaveDays,
            absentDays: summary.absentDays,
            missingDays: summary.missingDays,
        });
    }
    return points;
}
