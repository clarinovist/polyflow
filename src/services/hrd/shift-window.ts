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
export function calcPlannedHours(startTime: string, endTime: string): number | null {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  if (isNaN(start) || isNaN(end)) return null;

  const minutes = end > start
    ? end - start
    : (1440 - start) + end; // overnight

  return Math.round((minutes / 60) * 100) / 100; // 2 decimal places
}

/**
 * Resolve workDate from a clock-in timestamp.
 * Uses Asia/Jakarta (WIB, UTC+7).
 * For overnight shifts: clock-in before shift start → workDate = previous day.
 * Normal: workDate = calendar date of clock-in in WIB.
 */
export function resolveWorkDate(clockInAt: Date, shiftStartTime: string, shiftEndTime: string): Date {
  const wib = new Date(clockInAt.getTime() + 7 * 60 * 60 * 1000);
  const wibMinutes = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  const startMinutes = parseTime(shiftStartTime);

  // Overnight shift (e.g. 22:00→06:00): clock-in before shift start means
  // the employee arrived after midnight for a shift that started yesterday.
  if (isOvernightShift(shiftStartTime, shiftEndTime) && wibMinutes < startMinutes) {
    const prevDay = new Date(wib.getTime() - 24 * 60 * 60 * 1000);
    const dateStr = prevDay.toISOString().slice(0, 10);
    return new Date(dateStr + 'T00:00:00.000Z');
  }

  const dateStr = wib.toISOString().slice(0, 10);
  return new Date(dateStr + 'T00:00:00.000Z');
}

/** Get today's date string in WIB (Asia/Jakarta, UTC+7). */
export function todayWibDateString(): string {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().slice(0, 10);
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
export function calcOvertimeHours(actualHours: number, plannedHours: number): number {
  const diff = actualHours - plannedHours;
  return diff > 0 ? Math.round(diff * 100) / 100 : 0;
}

/**
 * Calculate regular hours: min(actual, planned).
 */
export function calcRegularHours(actualHours: number, plannedHours: number): number {
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
  return calcPlannedHours(startTime, endTime) ?? 8; // fallback to 8h
}
