import { describe, expect, it } from 'vitest';
import { ValidationError } from '@/lib/errors/errors';
import {
    buildAttendanceTrend,
    MAX_TREND_RANGE_DAYS,
    presetDateRange,
    validateTrendRange,
    type AttendanceTrendRecordInput,
} from '../attendance-trend';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function rec(
    employeeId: string,
    date: string,
    overrides: Partial<AttendanceTrendRecordInput> = {},
): AttendanceTrendRecordInput {
    return {
        employeeId,
        workDate: d(date),
        status: 'PRESENT',
        // 07:55 WIB = 00:55 UTC (on time for 08:00 shift)
        clockInAt: new Date(`${date}T00:55:00.000Z`),
        workShift: { startTime: '08:00' },
        ...overrides,
    };
}

describe('validateTrendRange & presetDateRange', () => {
    it('accepts up to 92 inclusive days and rejects 93 days or invalid dates', () => {
        expect(() => validateTrendRange('2026-07-01', '2026-09-30')).not.toThrow();
        expect(() => validateTrendRange('2026-07-01', '2026-10-01')).toThrow(
            ValidationError,
        );
        expect(() => validateTrendRange('2026-02-30', '2026-03-01')).toThrow(
            ValidationError,
        );
        expect(() => validateTrendRange('2026-07-10', '2026-07-09')).toThrow(
            ValidationError,
        );
        expect(MAX_TREND_RANGE_DAYS).toBe(92);
    });

    it('computes inclusive preset date ranges across month/year boundaries', () => {
        expect(presetDateRange(7, '2026-01-03')).toEqual({
            from: '2025-12-28',
            to: '2026-01-03',
        });
        expect(presetDateRange(30, '2026-05-30')).toEqual({
            from: '2026-05-01',
            to: '2026-05-30',
        });
    });
});

describe('buildAttendanceTrend', () => {
    it('excludes Sundays, deduplicates multi-shift employees, and keeps onTime + late === present', () => {
        // 2026-07-04 Sat, 2026-07-05 Sun (skipped), 2026-07-06 Mon
        const result = buildAttendanceTrend({
            from: '2026-07-04',
            to: '2026-07-06',
            graceMinutes: 5,
            eligible: [
                { id: 'e1', joinDate: null },
                { id: 'e2', joinDate: null },
                { id: 'e3', joinDate: null },
            ],
            records: [
                // 2026-07-04: e1 has 2 shifts (1st on time, 2nd late) -> 1 present, 1 late, 0 onTime
                rec('e1', '2026-07-04'),
                rec('e1', '2026-07-04', {
                    clockInAt: new Date('2026-07-04T07:20:00.000Z'),
                    workShift: { startTime: '14:00' },
                }),
                // e2 ON_LEAVE, e3 ABSENT
                rec('e2', '2026-07-04', { status: 'ON_LEAVE', clockInAt: null }),
                rec('e3', '2026-07-04', { status: 'ABSENT', clockInAt: null }),
                // Sunday record ignored
                rec('e1', '2026-07-05'),
                // 2026-07-06: e1 on time (within 5m grace), e2 has ABSENT + PRESENT -> PRESENT wins
                rec('e1', '2026-07-06', {
                    clockInAt: new Date('2026-07-06T01:05:00.000Z'),
                }),
                rec('e2', '2026-07-06', { status: 'ABSENT', clockInAt: null }),
                rec('e2', '2026-07-06'),
            ],
        });

        expect(result.shiftFiltered).toBe(false);
        expect(result.days).toHaveLength(2);
        expect(result.days[0]).toEqual({
            date: '2026-07-04',
            onTime: 0,
            late: 1,
            present: 1,
            onLeave: 1,
            absent: 1,
            noRecord: 0,
            eligibleHeadcount: 3,
            attendanceRate: 33.3,
        });
        expect(result.days[1]).toEqual({
            date: '2026-07-06',
            onTime: 2,
            late: 0,
            present: 2,
            onLeave: 0,
            absent: 0,
            noRecord: 1,
            eligibleHeadcount: 3,
            attendanceRate: 66.7,
        });
        expect(result.averageRate).toBe(50);
        expect(result.totals).toEqual({
            onTime: 2,
            late: 1,
            present: 3,
            onLeave: 1,
            absent: 1,
            noRecord: 1,
        });
    });

    it('handles zero eligible employees, mid-range WIB joinDate, and historical records > active headcount', () => {
        // Zero eligible
        const empty = buildAttendanceTrend({
            from: '2026-07-06',
            to: '2026-07-06',
            graceMinutes: 5,
            eligible: [],
            records: [],
        });
        expect(empty.days[0].attendanceRate).toBeNull();
        expect(empty.averageRate).toBeNull();

        // Mid-range WIB joinDate: 2026-05-10T18:00:00Z = 2026-05-11 01:00 WIB
        const res = buildAttendanceTrend({
            from: '2026-05-10',
            to: '2026-05-11',
            graceMinutes: 5,
            eligible: [
                { id: 'e-new', joinDate: new Date('2026-05-10T18:00:00Z') },
            ],
            records: [
                // 2026-05-10 is Sunday -> skipped; 2026-05-11 has 2 historical records vs 1 active
                rec('e-new', '2026-05-11'),
                rec('e-inactive', '2026-05-11'),
            ],
        });
        expect(res.days).toHaveLength(1);
        expect(res.days[0]).toMatchObject({
            date: '2026-05-11',
            eligibleHeadcount: 1,
            present: 2,
            noRecord: 0,
            attendanceRate: 100,
        });
    });

    it('hides headcount, noRecord, and attendanceRate when filtered by workShiftId', () => {
        const res = buildAttendanceTrend({
            from: '2026-07-06',
            to: '2026-07-06',
            workShiftId: 'shift-1',
            graceMinutes: 5,
            eligible: [],
            records: [
                rec('e1', '2026-07-06'),
                rec('e2', '2026-07-06', {
                    clockInAt: new Date('2026-07-06T01:20:00.000Z'),
                }),
            ],
        });

        expect(res.shiftFiltered).toBe(true);
        expect(res.days[0]).toEqual({
            date: '2026-07-06',
            onTime: 1,
            late: 1,
            present: 2,
            onLeave: 0,
            absent: 0,
            noRecord: null,
            eligibleHeadcount: null,
            attendanceRate: null,
        });
        expect(res.averageRate).toBeNull();
        expect(res.totals.noRecord).toBeNull();
    });
});
