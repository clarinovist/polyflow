export type LeavePreset = 'TODAY' | 'TOMORROW' | 'WEEK' | 'MONTH';

export const MAX_LEAVE_DAYS = 31;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface PresetOffsets {
    startOffset: number;
    endOffset: number;
}

const PRESET_OFFSETS: Record<LeavePreset, PresetOffsets> = {
    TODAY: { startOffset: 0, endOffset: 0 },
    TOMORROW: { startOffset: 1, endOffset: 1 },
    WEEK: { startOffset: 0, endOffset: 6 },
    MONTH: { startOffset: 0, endOffset: 29 },
};

function toUtcMs(dateStr: string): number {
    const [year, month, day] = dateStr.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
}

function formatUtcMs(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
    return formatUtcMs(toUtcMs(dateStr) + days * MS_PER_DAY);
}

/** Inclusive day count between two yyyy-MM-dd dates; 0 when end < start. */
export function countLeaveDays(startDate: string, endDate: string): number {
    const diff = Math.round((toUtcMs(endDate) - toUtcMs(startDate)) / MS_PER_DAY);
    return diff < 0 ? 0 : diff + 1;
}

export function resolveLeavePreset(
    preset: LeavePreset,
    todayWib: string,
): { startDate: string; endDate: string; days: number } {
    const { startOffset, endOffset } = PRESET_OFFSETS[preset];
    const startDate = addDays(todayWib, startOffset);
    const endDate = addDays(todayWib, endOffset);
    return { startDate, endDate, days: countLeaveDays(startDate, endDate) };
}
