/**
 * Timezone utilities for server-side rendering.
 * Database stores UTC; display & business-day filters in WIB (Asia/Jakarta, UTC+7).
 *
 * Canonical rule: a "business day D" means [D 00:00:00 WIB .. D 23:59:59.999 WIB].
 * All date-only filters must use getWibDayBounds() — never setHours() on server-local.
 */

export const BUSINESS_TIMEZONE = 'Asia/Jakarta';

/**
 * Format a UTC date to WIB display string.
 * Use in Server Components where browser timezone is not available.
 */
export function formatWIB(date: Date | string | null | undefined, pattern: string): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  // Convert to WIB parts
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find(p => p.type === type)?.value || '';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[parseInt(month, 10) - 1] || month;

  // Simple pattern replacement
  return pattern
    .replace('yyyy', year)
    .replace('MMM', monthName)
    .replace('MM', month)
    .replace('dd', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second);
}

// ---------------------------------------------------------------------------
// WIB Business Day helpers
// ---------------------------------------------------------------------------

/**
 * Parse and validate a YYYY-MM-DD date string.
 * Returns the same string if valid, throws if not.
 */
export function parseBusinessDate(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  // Validate it's a real date (e.g. not 2026-02-30)
  const [y, m, d] = dateStr.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    throw new Error(`Invalid date: "${dateStr}".`);
  }
  return dateStr;
}

/**
 * Get inclusive day bounds for a business date in WIB, returned as UTC instants
 * suitable for Prisma `where` filters.
 *
 * Example: getWibDayBounds('2026-07-02')
 *   start = 2026-07-01T17:00:00.000Z  (2 Jul 00:00 WIB)
 *   end   = 2026-07-02T16:59:59.999Z  (2 Jul 23:59:59.999 WIB)
 */
export function getWibDayBounds(dateStr: string): { startOfDay: Date; endOfDay: Date } {
  const validated = parseBusinessDate(dateStr);
  const [y, m, d] = validated.split('-').map(Number);

  // WIB midnight for day D in UTC instant
  // WIB = UTC+7, so WIB 00:00 = UTC previous day 17:00
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 7 * 60 * 60 * 1000;
  // WIB 23:59:59.999 = start + 24h - 1ms
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;

  return {
    startOfDay: new Date(startMs),
    endOfDay: new Date(endMs),
  };
}

/**
 * From a Date (that may be browser-local midnight from date picker),
 * extract the YYYY-MM-DD business date string in WIB.
 *
 * e.g. new Date('2026-07-02T00:00:00+07:00') → '2026-07-02'
 *      new Date('2026-07-01T17:00:00.000Z')  → '2026-07-02'
 */
export function toBusinessDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date for toBusinessDateString');
  }

  // Get WIB parts via Intl
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);

  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';

  return `${year}-${month}-${day}`;
}

/**
 * Convert a business date string to a stable UTC instant for storage as entryDate.
 * Uses WIB midnight of that day → UTC instant.
 *
 * e.g. businessDateToEntryDate('2026-07-02') → Date('2026-07-01T17:00:00.000Z')
 */
export function businessDateToEntryDate(dateStr: string): Date {
  const { startOfDay } = getWibDayBounds(dateStr);
  return startOfDay;
}

/**
 * Format an instant as date-only in WIB with the given pattern.
 * Default pattern: 'dd MMM yyyy' → '02 Jul 2026'
 *
 * This is the safe replacement for format(new Date(iso), 'dd MMM yyyy')
 * without a timeZone option.
 */
export function formatWibDate(date: Date | string, pattern: string = 'dd MMM yyyy'): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // Already a date string — format directly as business date
    const [y, m, d] = date.split('-').map(Number);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return pattern
      .replace('yyyy', String(y))
      .replace('MMM', monthNames[m - 1])
      .replace('MM', String(m).padStart(2, '0'))
      .replace('dd', String(d).padStart(2, '0'));
  }

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);

  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[parseInt(month, 10) - 1] || month;

  return pattern
    .replace('yyyy', year)
    .replace('MMM', monthName)
    .replace('MM', month)
    .replace('dd', day);
}
