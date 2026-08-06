import { ValidationError } from '@/lib/errors/errors';

const MINUTES_PER_DAY = 1440;
const DEFAULT_SHIFT_HOURS = 8;
const WIB_OFFSET_HOURS = 7;
const WIB_OFFSET_MS = WIB_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Shift window utilities for attendance.
 * Handles overnight shifts, planned hours calculation, and workDate resolution.
 */

/** Parse "HH:MM" string to minutes since midnight. */
function parseTime(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

/** Check if a shift crosses midnight (e.g. 22:00 → 06:00). */
export function isOvernightShift(startTime: string, endTime: string): boolean {
    return parseTime(startTime) > parseTime(endTime);
}

/**
 * Calculate planned hours from startTime/endTime strings.
 * Handles overnight shifts correctly.
 * Returns null if times are invalid.
 */
export function calcPlannedHours(
    startTime: string,
    endTime: string,
): number | null {
    const start = parseTime(startTime);
    const end = parseTime(endTime);
    if (isNaN(start) || isNaN(end)) return null;

    const minutes = end > start ? end - start : MINUTES_PER_DAY - start + end; // overnight

    return Math.round((minutes / 60) * 100) / 100; // 2 decimal places
}

/**
 * Resolve workDate from a clock-in timestamp.
 * Uses Asia/Jakarta (WIB, UTC+7).
 * For overnight shifts: clock-in before shift start → workDate = previous day.
 * Normal: workDate = calendar date of clock-in in WIB.
 */
export function resolveWorkDate(
    clockInAt: Date,
    shiftStartTime: string,
    shiftEndTime: string,
): Date {
    const wib = new Date(clockInAt.getTime() + 7 * 60 * 60 * 1000);
    const wibMinutes = wib.getUTCHours() * 60 + wib.getUTCMinutes();
    const startMinutes = parseTime(shiftStartTime);

    // Overnight shift (e.g. 22:00→06:00): clock-in before shift start means
    // the employee arrived after midnight for a shift that started yesterday.
    if (
        isOvernightShift(shiftStartTime, shiftEndTime) &&
        wibMinutes < startMinutes
    ) {
        const prevDay = new Date(wib.getTime() - 24 * 60 * 60 * 1000);
        const dateStr = prevDay.toISOString().slice(0, 10);
        return new Date(dateStr + 'T00:00:00.000Z');
    }

    const dateStr = wib.toISOString().slice(0, 10);
    return new Date(dateStr + 'T00:00:00.000Z');
}

/** Get today's date string in WIB (Asia/Jakarta, UTC+7). */
export function todayWibDateString(): string {
    return wibDateStringFrom(new Date());
}

/** Date string YYYY-MM-DD in WIB for an arbitrary timestamp. */
export function wibDateStringFrom(date: Date): string {
    const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return wib.toISOString().slice(0, 10);
}

/** Date-only Date (UTC midnight) from a timestamp in WIB calendar. */
export function wibDateFrom(date: Date): Date {
    return new Date(wibDateStringFrom(date) + 'T00:00:00.000Z');
}

/**
 * Calculate actual hours between clock-in and clock-out.
 * Returns hours rounded to 2 decimal places.
 */
export function calcActualHours(clockInAt: Date, clockOutAt: Date): number {
    const ms = clockOutAt.getTime() - clockInAt.getTime();
    const hours = ms / (1000 * 60 * 60);
    return Math.round(hours * 100) / 100;
}

/**
 * Calculate overtime hours: max(0, actual - planned).
 * Returns 0 if actual <= planned or if no clock-out yet.
 */
export function calcOvertimeHours(
    actualHours: number,
    plannedHours: number,
): number {
    const diff = actualHours - plannedHours;
    return diff > 0 ? Math.round(diff * 100) / 100 : 0;
}

/**
 * Calculate regular hours: min(actual, planned).
 */
export function calcRegularHours(
    actualHours: number,
    plannedHours: number,
): number {
    return Math.round(Math.min(actualHours, plannedHours) * 100) / 100;
}

/**
 * Get effective planned hours: explicit override or calculated from start/end.
 */
export function getEffectivePlannedHours(
    plannedHours: number | null | undefined,
    startTime: string,
    endTime: string,
): number {
    if (plannedHours != null && plannedHours > 0) return plannedHours;
    return calcPlannedHours(startTime, endTime) ?? DEFAULT_SHIFT_HOURS;
}

const NAIVE_DATETIME_RE =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/**
 * Parse a datetime-local string as WIB (Asia/Jakarta, UTC+7).
 *
 * `<input type="datetime-local">` emits naive strings like `2026-07-28T16:00`.
 * `new Date()` would read those in the *runtime* timezone — UTC inside the
 * container — silently shifting every HRD correction by 7 hours. Attendance is
 * always entered in WIB, so pin the offset instead of trusting the runtime.
 * Strings with an explicit offset (`Z` or `±HH:MM`) are honoured as-is.
 */
export function parseWibDateTime(value: string): Date {
    if (typeof value !== 'string' || !value.trim()) {
        throw new ValidationError('Input datetime tidak valid');
    }

    if (value.includes('Z') || /[+-]\d{2}:\d{2}$/.test(value)) {
        const d = new Date(value);
        if (isNaN(d.getTime())) {
            throw new ValidationError(
                `Format datetime tidak valid: "${value}"`,
            );
        }
        return d;
    }

    const m = NAIVE_DATETIME_RE.exec(value);
    if (!m) {
        throw new ValidationError(`Format datetime tidak valid: "${value}"`);
    }

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = m[6] !== undefined ? Number(m[6]) : 0;
    const ms = m[7] !== undefined ? Number(m[7].padEnd(3, '0')) : 0;

    if (
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31 ||
        hour > 23 ||
        minute > 59 ||
        second > 59
    ) {
        throw new ValidationError(`Format datetime tidak valid: "${value}"`);
    }

    // Construct UTC instant: naive value is WIB (UTC+7), subtract 7 hours.
    const utcMs =
        Date.UTC(year, month - 1, day, hour, minute, second, ms) -
        WIB_OFFSET_MS;
    return new Date(utcMs);
}
