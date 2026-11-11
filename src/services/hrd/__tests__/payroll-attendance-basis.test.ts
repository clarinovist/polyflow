import { describe, it, expect } from 'vitest';
import {
    computeAttendanceBasis,
    computeAttendanceProration,
    DEDUCTIBLE_LEAVE_TYPES,
    PAID_LEAVE_TYPES,
    type AttendanceBasisInput,
} from '../payroll-attendance-basis';

// Juli 2026: 1 Juli = Rabu; Minggu = 5, 12, 19, 26 → 27 hari Senin–Sabtu.
const day = (d: number, monthIndex = 6) =>
    new Date(Date.UTC(2026, monthIndex, d));
const PERIOD_START = day(1);
const PERIOD_END = day(31);
const AFTER_PERIOD = new Date(Date.UTC(2026, 7, 15));

type LeaveType =
    AttendanceBasisInput['leaves'][number]['type'];

function basis(over: Partial<AttendanceBasisInput> = {}) {
    return computeAttendanceBasis({
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        today: AFTER_PERIOD,
        joinDate: null,
        records: [],
        leaves: [],
        ...over,
    });
}

const present = (d: number) => ({
    workDate: day(d),
    status: 'PRESENT' as const,
    clockInAt: new Date(Date.UTC(2026, 6, d, 1, 0)),
});
const absent = (d: number) => ({
    workDate: day(d),
    status: 'ABSENT' as const,
    clockInAt: null,
});
const onLeave = (d: number) => ({
    workDate: day(d),
    status: 'ON_LEAVE' as const,
    clockInAt: null,
});
const leave = (type: LeaveType, from: Date, to: Date) => ({
    type,
    startDate: from,
    endDate: to,
});

/** Semua hari Senin–Sabtu Juli 2026 sebagai catatan hadir (supaya missingDays = 0). */
function allPresentExcept(skip: number[]) {
    const out = [];
    for (let d = 1; d <= 31; d++) {
        if (skip.includes(d)) continue;
        if (new Date(Date.UTC(2026, 6, d)).getUTCDay() === 0) continue;
        out.push(present(d));
    }
    return out;
}

describe('leave type constants', () => {
    it('pays ANNUAL/SICK/MATERNITY and deducts PERMISSION/UNPAID/OTHER', () => {
        expect([...PAID_LEAVE_TYPES].sort()).toEqual(
            ['ANNUAL', 'MATERNITY', 'SICK'].sort(),
        );
        expect([...DEDUCTIBLE_LEAVE_TYPES].sort()).toEqual(
            ['OTHER', 'PERMISSION', 'UNPAID'].sort(),
        );
    });
});

describe('computeAttendanceBasis', () => {
    it('workingDays counts Mon-Sat of the period', () => {
        expect(basis().workingDays).toBe(27);
    });

    it('rule 1: a day with clockInAt is never deducted, even with an overlapping deductible leave', () => {
        const r = basis({
            records: [present(7), ...allPresentExcept([6, 7, 8])],
            leaves: [leave('PERMISSION', day(6), day(8))],
        });
        expect(r.deductibleLeaveDays).toBe(2); // 6 and 8 only
        expect(r.absentDays).toBe(0);
    });

    it('rule 1: clockInAt wins over an ABSENT record on the same date', () => {
        const r = basis({
            records: [
                ...allPresentExcept([6]),
                absent(6),
                present(6),
            ],
        });
        expect(r.absentDays).toBe(0);
        expect(r.missingDays).toBe(0);
    });

    it('rule 2: SICK leave plus an ABSENT record on the same date is not deducted', () => {
        const r = basis({
            records: [...allPresentExcept([6]), absent(6)],
            leaves: [leave('SICK', day(6), day(6))],
        });
        expect(r.absentDays).toBe(0);
        expect(r.deductibleLeaveDays).toBe(0);
        expect(r.paidLeaveDays).toBe(1);
    });

    it.each(['ANNUAL', 'SICK', 'MATERNITY'] as const)(
        'rule 2: approved %s leave is paid, not deducted',
        (type) => {
            const r = basis({
                records: allPresentExcept([6, 7]),
                leaves: [leave(type, day(6), day(7))],
            });
            expect(r.paidLeaveDays).toBe(2);
            expect(r.deductibleLeaveDays).toBe(0);
            expect(r.missingDays).toBe(0);
        },
    );

    it('rule 2: a paid leave wins over an overlapping deductible leave', () => {
        const r = basis({
            records: allPresentExcept([6, 7]),
            leaves: [
                leave('PERMISSION', day(6), day(7)),
                leave('ANNUAL', day(7), day(7)),
            ],
        });
        expect(r.deductibleLeaveDays).toBe(1); // day 6
        expect(r.paidLeaveDays).toBe(1); // day 7
    });

    it.each(['PERMISSION', 'UNPAID', 'OTHER'] as const)(
        'rule 3: approved %s leave deducts one day per covered Mon-Sat date',
        (type) => {
            const r = basis({
                records: allPresentExcept([6, 7]),
                leaves: [leave(type, day(6), day(7))],
            });
            expect(r.deductibleLeaveDays).toBe(2);
            expect(r.paidLeaveDays).toBe(0);
        },
    );

    it('rule 3: deductible leave beats an ON_LEAVE record and is not counted as unlinked', () => {
        const r = basis({
            records: [...allPresentExcept([6]), onLeave(6)],
            leaves: [leave('UNPAID', day(6), day(6))],
        });
        expect(r.deductibleLeaveDays).toBe(1);
        expect(r.unlinkedLeaveDays).toBe(0);
    });

    it('rule 4: ABSENT records deduct one day each', () => {
        const r = basis({ records: [...allPresentExcept([6, 7]), absent(6), absent(7)] });
        expect(r.absentDays).toBe(2);
    });

    it('rule 4: two ABSENT records (two shifts) on one date count as one day', () => {
        const r = basis({
            records: [...allPresentExcept([6]), absent(6), absent(6)],
        });
        expect(r.absentDays).toBe(1);
    });

    it('Sundays never count: ABSENT record and leave on a Sunday are ignored', () => {
        const r = basis({
            records: [...allPresentExcept([]), absent(12)],
            leaves: [leave('PERMISSION', day(12), day(12))],
        });
        expect(r.absentDays).toBe(0);
        expect(r.deductibleLeaveDays).toBe(0);
        expect(r.paidLeaveDays).toBe(0);
        expect(r.missingDays).toBe(0);
    });

    it('a leave spanning a Sunday deducts only the Mon-Sat dates', () => {
        // Sat 11, Sun 12, Mon 13
        const r = basis({
            records: allPresentExcept([11, 13]),
            leaves: [leave('PERMISSION', day(11), day(13))],
        });
        expect(r.deductibleLeaveDays).toBe(2);
    });

    it('rule 5: dates up to today without record or leave are missing; later dates are not', () => {
        // today Fri 10 Jul: Jul 1-4 (4 days) + Jul 6-10 (5 days) = 9
        const r = basis({ today: day(10) });
        expect(r.missingDays).toBe(9);
        expect(r.absentDays).toBe(0);
        expect(r.deductibleLeaveDays).toBe(0);
    });

    it('rule 5: today itself counts, tomorrow does not', () => {
        expect(basis({ today: day(1) }).missingDays).toBe(1);
        expect(basis({ today: day(0, 6) }).missingDays).toBe(0); // 30 Jun
    });

    it('rule 5: dates before joinDate are not missing', () => {
        // joined Wed 8 Jul, today Fri 10 Jul → 8, 9, 10
        const r = basis({ today: day(10), joinDate: day(8) });
        expect(r.missingDays).toBe(3);
    });

    it('rule 5: joinDate after the period gives no missing days', () => {
        const r = basis({ joinDate: new Date(Date.UTC(2026, 7, 3)) });
        expect(r.missingDays).toBe(0);
    });

    it('rule 5: a date covered by a leave is not missing', () => {
        const r = basis({
            today: day(3),
            leaves: [leave('SICK', day(1), day(2))],
        });
        expect(r.missingDays).toBe(1); // only Jul 3
    });

    it('clips a leave that starts before the period to the period', () => {
        // 29 Jun (Mon) – 3 Jul (Fri): only Jul 1, 2, 3 are inside the period
        const r = basis({
            records: allPresentExcept([1, 2, 3]),
            leaves: [leave('PERMISSION', day(29, 5), day(3))],
        });
        expect(r.deductibleLeaveDays).toBe(3);
    });

    it('clips a leave that ends after the period to the period', () => {
        // 29 Jul – 5 Aug: Jul 29, 30, 31 inside
        const r = basis({
            records: allPresentExcept([29, 30, 31]),
            leaves: [leave('UNPAID', day(29), day(5, 7))],
        });
        expect(r.deductibleLeaveDays).toBe(3);
    });

    it('ON_LEAVE record without a covering approved leave is paid and counted as unlinked', () => {
        const r = basis({ records: [...allPresentExcept([6]), onLeave(6)] });
        expect(r.unlinkedLeaveDays).toBe(1);
        expect(r.deductibleLeaveDays).toBe(0);
        expect(r.absentDays).toBe(0);
        expect(r.missingDays).toBe(0);
    });

    it('ON_LEAVE record covered by a paid leave is not unlinked', () => {
        const r = basis({
            records: [...allPresentExcept([6]), onLeave(6)],
            leaves: [leave('SICK', day(6), day(6))],
        });
        expect(r.unlinkedLeaveDays).toBe(0);
        expect(r.paidLeaveDays).toBe(1);
    });

    it('returns all-zero counters for a fully present month', () => {
        expect(basis({ records: allPresentExcept([]) })).toEqual({
            workingDays: 27,
            absentDays: 0,
            deductibleLeaveDays: 0,
            paidLeaveDays: 0,
            missingDays: 0,
            unlinkedLeaveDays: 0,
        });
    });

    it('does not mutate its input', () => {
        const records = [absent(6)];
        const leaves = [leave('SICK', day(7), day(7))];
        const snapshot = JSON.stringify({ records, leaves });
        basis({ records, leaves });
        expect(JSON.stringify({ records, leaves })).toBe(snapshot);
    });
});

describe('computeAttendanceProration', () => {
    it('rounds salary / working days x (absent + deductible leave) to 2 decimals', () => {
        // 3.000.000 / 26 = 115384.615...
        const one = computeAttendanceProration(3_000_000, {
            workingDays: 26,
            absentDays: 1,
            deductibleLeaveDays: 0,
        });
        expect(one).toBe(115_384.62);
        const three = computeAttendanceProration(3_000_000, {
            workingDays: 26,
            absentDays: 1,
            deductibleLeaveDays: 2,
        });
        expect(three).toBe(346_153.85);
    });

    it('is 0 when nothing is deductible or there are no working days', () => {
        expect(
            computeAttendanceProration(3_000_000, {
                workingDays: 26,
                absentDays: 0,
                deductibleLeaveDays: 0,
            }),
        ).toBe(0);
        expect(
            computeAttendanceProration(3_000_000, {
                workingDays: 0,
                absentDays: 2,
                deductibleLeaveDays: 0,
            }),
        ).toBe(0);
    });
});
