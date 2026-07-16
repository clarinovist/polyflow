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
