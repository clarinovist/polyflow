// Mirrors the limits enforced by snoozeFinding (actions/findings/finding-actions.ts).
// That file is 'use server' and cannot export constants, so they are repeated
// here; the server stays the authority and re-validates every call.
const MIN_SNOOZE_DAYS = 1;
const MAX_SNOOZE_DAYS = 14;
export const MIN_SNOOZE_NOTE_LENGTH = 3;
const MAX_SNOOZE_NOTE_LENGTH = 500;

const MS_PER_DAY = 86_400_000;
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toDateInputValue(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

/** Earliest and latest value a `<input type="date">` may take for a snooze. */
export function snoozeDateBounds(now: Date): { min: string; max: string } {
    return {
        min: toDateInputValue(addLocalDays(now, MIN_SNOOZE_DAYS)),
        max: toDateInputValue(addLocalDays(now, MAX_SNOOZE_DAYS)),
    };
}

/** Whole days from today to a picked date, or null when it is not snoozable. */
export function daysFromToday(value: string, now: Date): number | null {
    const match = DATE_INPUT_PATTERN.exec(value);
    if (!match) return null;
    const [year, month, day] = [match[1], match[2], match[3]].map(Number);
    const picked = new Date(year, month - 1, day);
    const isRealDate =
        picked.getFullYear() === year &&
        picked.getMonth() === month - 1 &&
        picked.getDate() === day;
    if (!isRealDate) return null;

    const days = Math.round(
        (picked.getTime() - startOfLocalDay(now).getTime()) / MS_PER_DAY,
    );
    return days >= MIN_SNOOZE_DAYS && days <= MAX_SNOOZE_DAYS ? days : null;
}

export function isSnoozeNoteValid(note: string): boolean {
    const length = note.trim().length;
    return length >= MIN_SNOOZE_NOTE_LENGTH && length <= MAX_SNOOZE_NOTE_LENGTH;
}
