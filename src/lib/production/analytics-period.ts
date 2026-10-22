import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

export interface AnalyticsPeriod {
    /** Inclusive start: WIB 00:00 of the first business day, as a UTC instant. */
    start: Date;
    /** Inclusive end: WIB 23:59:59.999 of the last business day, as a UTC instant. */
    end: Date;
}

/**
 * Period for production analytics, always in WIB business days so it agrees
 * with Produksi Harian. An explicit range snaps to whole WIB days; without
 * one, the period is the current WIB month up to the end of today (WIB).
 * Never uses the server timezone: a UTC server would otherwise push entries
 * made 00:00-07:00 WIB on the 1st into the previous month.
 */
export function resolveAnalyticsPeriod(
    range?: { from: Date; to: Date },
    now: Date = new Date(),
): AnalyticsPeriod {
    const fromDay = range
        ? toBusinessDateString(range.from)
        : `${toBusinessDateString(now).slice(0, 7)}-01`;
    const toDay = range
        ? toBusinessDateString(range.to)
        : toBusinessDateString(now);

    return {
        start: getWibDayBounds(fromDay).startOfDay,
        end: getWibDayBounds(toDay).endOfDay,
    };
}
