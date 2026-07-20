/**
 * Monday–Sunday week bounds (UTC midnight).
 * For queries: extend ±1 day to catch WIB edge cases (e.g. Mon 02:00 WIB = Sun 19:00 UTC).
 */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
}

export function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/** WIB-safe query range: extend ±1 day to cover midnight WIB edge cases. */
export function weekQueryRange(weekStart: Date, weekEnd: Date) {
  const from = new Date(weekStart);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(weekEnd);
  to.setUTCDate(to.getUTCDate() + 1);
  to.setUTCHours(23, 59, 59, 999);
  return { from, to };
}

/**
 * True if this Mon–Sun week contains the last calendar day of any month.
 * Used for once-per-month BPJS deduction on weekly payroll (last week of month).
 * Dates compared as UTC calendar days (same convention as startOfWeek/endOfWeek).
 */
export function isLastWeekOfMonth(weekStart: Date, weekEnd: Date): boolean {
  return monthEndContainedInWeek(weekStart, weekEnd) != null;
}

/**
 * If the week contains a month-end day, returns { year, month (1–12) } for that month.
 * A 7-day week can contain at most one month-end.
 */
export function monthEndContainedInWeek(
  weekStart: Date,
  weekEnd: Date,
): { year: number; month: number } | null {
  const startMs = Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate(),
  );
  const endMs = Date.UTC(
    weekEnd.getUTCFullYear(),
    weekEnd.getUTCMonth(),
    weekEnd.getUTCDate(),
  );

  // Candidate months: month of weekStart and month of weekEnd (usually same or adjacent)
  const candidates = new Set<string>();
  candidates.add(`${weekStart.getUTCFullYear()}-${weekStart.getUTCMonth()}`);
  candidates.add(`${weekEnd.getUTCFullYear()}-${weekEnd.getUTCMonth()}`);

  for (const key of candidates) {
    const [yStr, mStr] = key.split('-');
    const y = Number(yStr);
    const m = Number(mStr); // 0-indexed
    // Last day of month m: day 0 of next month
    const lastDayMs = Date.UTC(y, m + 1, 0);
    if (lastDayMs >= startMs && lastDayMs <= endMs) {
      return { year: y, month: m + 1 };
    }
  }
  return null;
}
