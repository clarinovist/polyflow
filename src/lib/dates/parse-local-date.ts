/**
 * Parse a "yyyy-MM-dd" string as a local calendar day (midnight local time).
 *
 * `new Date("2026-07-23")` creates a UTC midnight date, which in timezones
 * ahead of UTC (e.g. WIB, UTC+7) shifts the calendar day back by one.
 * This helper avoids that bug.
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a Date as "yyyy-MM-dd" for `<input type="date">` value.
 * Uses local date components (not UTC).
 */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
