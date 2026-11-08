import { describe, expect, it } from 'vitest';
import {
    MIN_SNOOZE_NOTE_LENGTH,
    daysFromToday,
    isSnoozeNoteValid,
    snoozeDateBounds,
} from '../snooze-days';

// Local-time constructor on purpose: the date input works in local dates.
const NOW = new Date(2026, 10, 8, 15, 30);

describe('snoozeDateBounds', () => {
    it('allows tomorrow through fourteen days ahead', () => {
        expect(snoozeDateBounds(NOW)).toEqual({
            min: '2026-11-09',
            max: '2026-11-22',
        });
    });

    it('rolls over month and year ends', () => {
        expect(snoozeDateBounds(new Date(2026, 11, 25, 9))).toEqual({
            min: '2026-12-26',
            max: '2027-01-08',
        });
    });
});

describe('daysFromToday', () => {
    it('converts a picked date into whole days from today', () => {
        expect(daysFromToday('2026-11-09', NOW)).toBe(1);
        expect(daysFromToday('2026-11-15', NOW)).toBe(7);
        expect(daysFromToday('2026-11-22', NOW)).toBe(14);
    });

    it('does not depend on the time of day', () => {
        expect(daysFromToday('2026-11-09', new Date(2026, 10, 8, 0, 1))).toBe(1);
        expect(daysFromToday('2026-11-09', new Date(2026, 10, 8, 23, 59))).toBe(1);
    });

    it('rejects today, the past and anything beyond fourteen days', () => {
        expect(daysFromToday('2026-11-08', NOW)).toBeNull();
        expect(daysFromToday('2026-11-01', NOW)).toBeNull();
        expect(daysFromToday('2026-11-23', NOW)).toBeNull();
    });

    it('rejects empty and malformed input', () => {
        expect(daysFromToday('', NOW)).toBeNull();
        expect(daysFromToday('15/11/2026', NOW)).toBeNull();
        expect(daysFromToday('2026-13-45', NOW)).toBeNull();
    });
});

describe('isSnoozeNoteValid', () => {
    it('requires a trimmed note of at least the minimum length', () => {
        expect(MIN_SNOOZE_NOTE_LENGTH).toBe(3);
        expect(isSnoozeNoteValid('  ab  ')).toBe(false);
        expect(isSnoozeNoteValid('abc')).toBe(true);
    });

    it('rejects notes beyond the server limit', () => {
        expect(isSnoozeNoteValid('x'.repeat(500))).toBe(true);
        expect(isSnoozeNoteValid('x'.repeat(501))).toBe(false);
    });
});
