import { describe, it, expect } from 'vitest';
import {
    MAX_LEAVE_DAYS,
    countLeaveDays,
    resolveLeavePreset,
} from '../leave-presets';

describe('resolveLeavePreset', () => {
    it('TODAY covers only today', () => {
        expect(resolveLeavePreset('TODAY', '2026-11-11')).toEqual({
            startDate: '2026-11-11',
            endDate: '2026-11-11',
            days: 1,
        });
    });

    it('TOMORROW covers only the next day', () => {
        expect(resolveLeavePreset('TOMORROW', '2026-11-11')).toEqual({
            startDate: '2026-11-12',
            endDate: '2026-11-12',
            days: 1,
        });
    });

    it('WEEK covers today through today + 6 (7 days)', () => {
        expect(resolveLeavePreset('WEEK', '2026-11-11')).toEqual({
            startDate: '2026-11-11',
            endDate: '2026-11-17',
            days: 7,
        });
    });

    it('MONTH covers today through today + 29 (30 days)', () => {
        expect(resolveLeavePreset('MONTH', '2026-11-11')).toEqual({
            startDate: '2026-11-11',
            endDate: '2026-12-10',
            days: 30,
        });
    });

    it('rolls over month and year boundaries', () => {
        expect(resolveLeavePreset('TOMORROW', '2026-12-31').startDate).toBe(
            '2027-01-01',
        );
        expect(resolveLeavePreset('WEEK', '2026-12-28').endDate).toBe(
            '2027-01-03',
        );
    });

    it('handles leap-year February', () => {
        expect(resolveLeavePreset('TOMORROW', '2028-02-28').startDate).toBe(
            '2028-02-29',
        );
        expect(resolveLeavePreset('TOMORROW', '2027-02-28').startDate).toBe(
            '2027-03-01',
        );
    });
});

describe('countLeaveDays', () => {
    it('counts inclusively', () => {
        expect(countLeaveDays('2026-11-11', '2026-11-11')).toBe(1);
        expect(countLeaveDays('2026-11-11', '2026-11-13')).toBe(3);
    });

    it('counts across a month boundary', () => {
        expect(countLeaveDays('2026-11-29', '2026-12-02')).toBe(4);
    });

    it('returns a non-positive count when end is before start', () => {
        expect(countLeaveDays('2026-11-12', '2026-11-11')).toBe(0);
    });
});

describe('MAX_LEAVE_DAYS', () => {
    it('is 31', () => {
        expect(MAX_LEAVE_DAYS).toBe(31);
    });
});
