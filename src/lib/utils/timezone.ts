/**
 * Timezone utilities for server-side rendering.
 * Database stores UTC; display in WIB (Asia/Jakarta, UTC+7).
 */

const WIB_TIMEZONE = 'Asia/Jakarta';

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
    timeZone: WIB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
