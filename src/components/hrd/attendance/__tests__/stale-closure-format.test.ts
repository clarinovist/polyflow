import { describe, it, expect } from 'vitest';
import {
    formatHoursLong,
    formatWibDateTime,
    formatWorkDate,
} from '../stale-closure-format';

describe('stale-closure-format', () => {
    it('formats a calendar work date without timezone shift', () => {
        expect(formatWorkDate('2026-11-09')).toBe('9 Nov 2026');
    });

    it('shows a dash instead of Invalid Date for an empty work date', () => {
        expect(formatWorkDate('')).toBe('-');
    });

    it('formats an instant in WIB, crossing midnight into the next day', () => {
        expect(formatWibDateTime('2026-11-04T01:00:00.000Z')).toBe('4 Nov, 08.00');
        expect(formatWibDateTime('2026-11-03T20:00:00.000Z')).toBe('4 Nov, 03.00');
    });

    it('shows a dash for a missing instant', () => {
        expect(formatWibDateTime(null)).toBe('-');
        expect(formatWibDateTime('')).toBe('-');
    });

    it('formats hours with an Indonesian decimal comma and unit', () => {
        expect(formatHoursLong(7.5)).toBe('7,5 jam');
        expect(formatHoursLong(8)).toBe('8 jam');
        expect(formatHoursLong(null)).toBe('-');
    });
});
