import {
    getWibMonthBounds,
    parseBusinessDate,
    toBusinessDateString,
} from '@/lib/utils/timezone';

export interface AccountLedgerCalendarRange {
    from: string;
    to: string;
}

function calendarDate(
    value: string | string[] | undefined,
    fallback: string,
): string {
    if (value === undefined) return fallback;
    if (typeof value !== 'string')
        throw new Error('Tanggal harus berupa satu nilai.');
    return parseBusinessDate(value);
}

/** Resolve URL calendar dates once so the server query and picker agree. */
export function resolveAccountLedgerRange(
    query: { startDate?: string | string[]; endDate?: string | string[] },
    now = new Date(),
): AccountLedgerCalendarRange {
    const [year, month] = toBusinessDateString(now).split('-').map(Number);
    const defaults = getWibMonthBounds(year, month);
    const from = calendarDate(
        query.startDate,
        toBusinessDateString(defaults.start),
    );
    const to = calendarDate(query.endDate, toBusinessDateString(defaults.end));
    if (from > to)
        throw new Error('Tanggal awal tidak boleh melewati tanggal akhir.');
    return { from, to };
}
