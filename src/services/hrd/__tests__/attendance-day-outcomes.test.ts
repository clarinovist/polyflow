import { describe, expect, it } from 'vitest';
import {
    buildDayOutcomes,
    buildEmployeeMonthlyTrend,
    type AttendanceDayRecordInput,
} from '../attendance-day-outcomes';
import {
    computeAttendanceBasis,
    periodBounds,
    type ApprovedLeaveInput,
} from '../payroll-attendance-basis';

// Juli 2026: 1 Juli = Rabu; Minggu = 5, 12, 19, 26 → 27 hari Senin–Sabtu.
const day = (d: number, monthIndex = 6, year = 2026) =>
    new Date(Date.UTC(year, monthIndex, d));

const rec = (
    d: number,
    overrides: Partial<AttendanceDayRecordInput> = {},
    monthIndex = 6,
    year = 2026,
): AttendanceDayRecordInput => ({
    workDate: day(d, monthIndex, year),
    status: 'PRESENT',
    // 07:55 WIB = 00:55 UTC (on time for 08:00 shift)
    clockInAt: new Date(Date.UTC(year, monthIndex, d, 0, 55)),
    workShiftId: 's1',
    ...overrides,
});

const SHIFTS = new Map([
    ['s1', '08:00'],
    ['s-night', '22:00'],
]);

describe('buildDayOutcomes', () => {
    it('classifies all day statuses accurately including Sunday, beforeJoin, future, and late grace', () => {
        const { periodStart, periodEnd } = periodBounds(2026, 7);
        const { days, summary } = buildDayOutcomes({
            periodStart,
            periodEnd,
            today: day(10),
            joinDate: day(3),
            shiftStartTimes: SHIFTS,
            graceMinutes: 5,
            records: [
                // 3 Jul: on time (08:05:00 WIB = 01:05:00 UTC, within 5m grace)
                rec(3, { clockInAt: new Date(Date.UTC(2026, 6, 3, 1, 5, 0)) }),
                // 4 Jul: late (08:05:01 WIB = 01:05:01 UTC)
                rec(4, { clockInAt: new Date(Date.UTC(2026, 6, 4, 1, 5, 1)) }),
                // 5 Jul (Sunday): overtime record present
                rec(5, { clockInAt: new Date(Date.UTC(2026, 6, 5, 2, 0)) }),
                // 6 Jul: ABSENT
                rec(6, { status: 'ABSENT', clockInAt: null }),
                // 7 Jul: unlinked ON_LEAVE
                rec(7, { status: 'ON_LEAVE', clockInAt: null }),
                // 10 Jul: multi-shift (1st on time, 2nd late via precomputed flag) -> counted as 1 late day
                rec(10, { isLate: false }),
                rec(10, { workShiftId: 's-night', isLate: true }),
            ],
            leaves: [
                // 8 Jul: paid leave (SICK)
                { type: 'SICK', startDate: day(8), endDate: day(8) },
                // 9 Jul: deductible leave (UNPAID)
                { type: 'UNPAID', startDate: day(9), endDate: day(9) },
            ],
        });

        const byDate = new Map(days.map((d) => [d.date, d]));
        expect(byDate.get('2026-07-01')?.status).toBe('beforeJoin');
        expect(byDate.get('2026-07-02')?.status).toBe('beforeJoin');
        expect(byDate.get('2026-07-03')?.status).toBe('present');
        expect(byDate.get('2026-07-04')?.status).toBe('late');
        expect(byDate.get('2026-07-05')).toEqual({
            date: '2026-07-05',
            outcome: null,
            status: 'sunday',
            isLate: false,
            hasRecord: true,
        });
        expect(byDate.get('2026-07-06')?.status).toBe('absent');
        expect(byDate.get('2026-07-07')?.status).toBe('unlinkedLeave');
        expect(byDate.get('2026-07-08')?.status).toBe('paidLeave');
        expect(byDate.get('2026-07-09')?.status).toBe('deductibleLeave');
        expect(byDate.get('2026-07-10')?.status).toBe('late');
        // 11 Jul (Sat) > today (10 Jul) -> future
        expect(byDate.get('2026-07-11')?.status).toBe('future');
        // 12 Jul (Sun) -> sunday without record
        expect(byDate.get('2026-07-12')).toEqual({
            date: '2026-07-12',
            outcome: null,
            status: 'sunday',
            isLate: false,
            hasRecord: false,
        });

        expect(summary).toEqual({
            workingDays: 27,
            presentDays: 3,
            onTimeDays: 1,
            lateDays: 2,
            absentDays: 1,
            paidLeaveDays: 1,
            deductibleLeaveDays: 1,
            unlinkedLeaveDays: 1,
            leaveDays: 3,
            missingDays: 0,
        });
    });

    it('marks past Mon-Sat working days without record or leave as missing', () => {
        const { periodStart, periodEnd } = periodBounds(2026, 7);
        const { days, summary } = buildDayOutcomes({
            periodStart,
            periodEnd,
            today: day(4),
            joinDate: day(1),
            records: [rec(1)],
            leaves: [],
        });

        const byDate = new Map(days.map((d) => [d.date, d]));
        expect(byDate.get('2026-07-01')?.status).toBe('present');
        expect(byDate.get('2026-07-02')?.status).toBe('missing');
        expect(byDate.get('2026-07-03')?.status).toBe('missing');
        expect(byDate.get('2026-07-04')?.status).toBe('missing');
        expect(summary.missingDays).toBe(3);
    });

    it('matches computeAttendanceBasis strictly across mixed leaves, multi-shift, and joinDate (Invariant A4)', () => {
        const { periodStart, periodEnd } = periodBounds(2026, 7);
        const today = day(22);
        const joinDate = day(4);
        const records: AttendanceDayRecordInput[] = [
            // Clock-in overrides leave on Jul 6
            rec(6, { clockInAt: new Date(Date.UTC(2026, 6, 6, 1, 20)) }),
            // Multi-shift on Jul 7
            rec(7),
            rec(7, { workShiftId: 's-night' }),
            // Duplicate ABSENT on Jul 8
            rec(8, { status: 'ABSENT', clockInAt: null }),
            rec(8, { status: 'ABSENT', clockInAt: null, workShiftId: 's-night' }),
            // Unlinked ON_LEAVE on Jul 11
            rec(11, { status: 'ON_LEAVE', clockInAt: null }),
            // Sunday Jul 12 record (ignored by payroll & summary)
            rec(12),
            // Future ABSENT on Jul 25
            rec(25, { status: 'ABSENT', clockInAt: null }),
        ];
        const leaves: ApprovedLeaveInput[] = [
            // Overlapping paid + unpaid leave on Jul 13-15 -> paid wins
            { type: 'ANNUAL', startDate: day(6), endDate: day(6) },
            { type: 'SICK', startDate: day(13), endDate: day(15) },
            { type: 'UNPAID', startDate: day(14), endDate: day(17) },
        ];

        const { summary } = buildDayOutcomes({
            periodStart,
            periodEnd,
            today,
            joinDate,
            records,
            leaves,
            shiftStartTimes: SHIFTS,
            graceMinutes: 5,
        });
        const basis = computeAttendanceBasis({
            periodStart,
            periodEnd,
            today,
            joinDate,
            records,
            leaves,
        });

        expect(summary.workingDays).toBe(basis.workingDays);
        expect(summary.absentDays).toBe(basis.absentDays);
        expect(summary.deductibleLeaveDays).toBe(basis.deductibleLeaveDays);
        expect(summary.paidLeaveDays).toBe(basis.paidLeaveDays);
        expect(summary.unlinkedLeaveDays).toBe(basis.unlinkedLeaveDays);
        expect(summary.missingDays).toBe(basis.missingDays);
        expect(summary.onTimeDays + summary.lateDays).toBe(summary.presentDays);
    });
});

describe('buildEmployeeMonthlyTrend', () => {
    it('builds chronological 6-month trend across year boundary with mutually exclusive counts', () => {
        const points = buildEmployeeMonthlyTrend({
            endYear: 2026,
            endMonth: 1,
            months: 6,
            today: day(15, 0, 2026),
            joinDate: day(1, 7, 2025),
            shiftStartTimes: SHIFTS,
            graceMinutes: 5,
            records: [
                // Aug 2025: 1 on-time, 1 late
                rec(4, {}, 7, 2025),
                rec(5, { clockInAt: new Date(Date.UTC(2025, 7, 5, 1, 30)) }, 7, 2025),
                // Jan 2026: 1 absent, 1 on-time
                rec(2, {}, 0, 2026),
                rec(3, { status: 'ABSENT', clockInAt: null }, 0, 2026),
            ],
            leaves: [
                {
                    type: 'ANNUAL',
                    startDate: day(6, 7, 2025),
                    endDate: day(7, 7, 2025),
                },
            ],
        });

        expect(points).toHaveLength(6);
        expect(points.map((p) => `${p.year}-${p.month}`)).toEqual([
            '2025-8',
            '2025-9',
            '2025-10',
            '2025-11',
            '2025-12',
            '2026-1',
        ]);
        expect(points[0]).toMatchObject({
            label: 'Agu 25',
            onTimeDays: 1,
            lateDays: 1,
            presentDays: 2,
            leaveDays: 2,
            absentDays: 0,
        });
        expect(points[5]).toMatchObject({
            label: 'Jan 26',
            onTimeDays: 1,
            lateDays: 0,
            presentDays: 1,
            absentDays: 1,
        });
    });
});
