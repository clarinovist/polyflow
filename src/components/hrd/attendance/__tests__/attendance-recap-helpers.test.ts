import { describe, expect, it } from 'vitest';
import {
    buildYearOptions,
    filterAttendanceRecords,
    isFutureWorkDate,
    parseStatusFilter,
    summarizeAttendance,
    type RecapRecord,
} from '../attendance-recap-helpers';

let seq = 0;
const rec = (overrides: Partial<RecapRecord> = {}): RecapRecord => {
    seq += 1;
    return {
        id: `r-${seq}`,
        employeeId: 'emp-1',
        employeeCode: 'E001',
        employeeName: 'Alfa Contoh',
        status: 'PRESENT',
        isLate: false,
        isOutsideRadius: false,
        hasValidSelfie: true,
        ...overrides,
    };
};

describe('parseStatusFilter', () => {
    it.each(['norecord', 'late', 'outside', 'nophoto', 'absent', 'leave'])(
        'accepts %s',
        (value) => {
            expect(parseStatusFilter(value)).toBe(value);
        },
    );

    it.each([undefined, null, '', 'PRESENT', 'unknown', 'all '])(
        'falls back to all for %j',
        (value) => {
            expect(parseStatusFilter(value)).toBe('all');
        },
    );
});

describe('summarizeAttendance', () => {
    it('counts one person once even with two shifts on the same day', () => {
        const summary = summarizeAttendance(
            [
                rec({ employeeId: 'a' }),
                rec({ employeeId: 'a', isLate: true }),
                rec({ employeeId: 'b' }),
            ],
            0,
        );

        expect(summary.present).toBe(2);
        expect(summary.late).toBe(1);
    });

    it('gives PRESENT priority over ON_LEAVE over ABSENT for the same person', () => {
        const summary = summarizeAttendance(
            [
                rec({ employeeId: 'a', status: 'ABSENT' }),
                rec({ employeeId: 'a', status: 'PRESENT' }),
                rec({ employeeId: 'b', status: 'ABSENT' }),
                rec({ employeeId: 'b', status: 'ON_LEAVE' }),
                rec({ employeeId: 'c', status: 'ABSENT' }),
            ],
            0,
        );

        expect(summary).toMatchObject({
            present: 1,
            onLeave: 1,
            absent: 1,
        });
    });

    it('keeps late as a subset of present', () => {
        const summary = summarizeAttendance(
            [
                rec({ employeeId: 'a', isLate: true }),
                rec({ employeeId: 'b', status: 'ABSENT', isLate: true }),
            ],
            0,
        );

        expect(summary.late).toBe(1);
        expect(summary.late).toBeLessThanOrEqual(summary.present);
    });

    it('counts outside-radius and no-selfie anomalies for present people only', () => {
        const summary = summarizeAttendance(
            [
                rec({ employeeId: 'a', isOutsideRadius: true }),
                rec({ employeeId: 'b', hasValidSelfie: false }),
                rec({
                    employeeId: 'c',
                    status: 'ABSENT',
                    hasValidSelfie: false,
                    isOutsideRadius: true,
                }),
            ],
            0,
        );

        expect(summary.outsideRadius).toBe(1);
        expect(summary.noSelfie).toBe(1);
    });

    it('does not flag a missing selfie field as an anomaly', () => {
        const { hasValidSelfie: _omit, ...legacy } = rec();
        void _omit;

        expect(summarizeAttendance([legacy], 0).noSelfie).toBe(0);
    });

    it('passes the no-record count through and tolerates null (not loaded)', () => {
        expect(summarizeAttendance([], 7).noRecord).toBe(7);
        expect(summarizeAttendance([], null).noRecord).toBeNull();
    });
});

describe('filterAttendanceRecords', () => {
    const records = [
        rec({ id: 'present', employeeCode: 'E001', employeeName: 'Alfa Contoh' }),
        rec({ id: 'late', employeeCode: 'E002', employeeName: 'Beta Contoh', isLate: true }),
        rec({ id: 'outside', employeeCode: 'E003', employeeName: 'Gamma Contoh', isOutsideRadius: true }),
        rec({ id: 'nophoto', employeeCode: 'E004', employeeName: 'Delta Contoh', hasValidSelfie: false }),
        rec({ id: 'absent', employeeCode: 'E005', employeeName: 'Epsilon Contoh', status: 'ABSENT', hasValidSelfie: false }),
        rec({ id: 'leave', employeeCode: 'E006', employeeName: 'Zeta Contoh', status: 'ON_LEAVE' }),
    ];
    const ids = (status: Parameters<typeof filterAttendanceRecords>[1], query = '') =>
        filterAttendanceRecords(records, status, query).map((r) => r.id);

    it('returns everything for all', () => {
        expect(ids('all')).toHaveLength(6);
    });

    it('filters by derived and enum statuses', () => {
        expect(ids('late')).toEqual(['late']);
        expect(ids('outside')).toEqual(['outside']);
        expect(ids('nophoto')).toEqual(['nophoto']);
        expect(ids('absent')).toEqual(['absent']);
        expect(ids('leave')).toEqual(['leave']);
        expect(ids('present')).toEqual(['present', 'late', 'outside', 'nophoto']);
    });

    it('limits the outside-radius filter to present records, like the chip count', () => {
        const withAbsentOutside = [
            ...records,
            rec({ id: 'absent-outside', status: 'ABSENT', isOutsideRadius: true }),
        ];

        expect(
            filterAttendanceRecords(withAbsentOutside, 'outside', '').map((r) => r.id),
        ).toEqual(['outside']);
    });

    it('does not list a record for norecord (those people have no record)', () => {
        expect(ids('norecord')).toEqual([]);
    });

    it('matches the search query on name or code, ignoring case and spaces', () => {
        expect(ids('all', '  gamma ')).toEqual(['outside']);
        expect(ids('all', 'e005')).toEqual(['absent']);
    });

    it('combines status and query', () => {
        expect(ids('present', 'beta')).toEqual(['late']);
        expect(ids('absent', 'beta')).toEqual([]);
    });

    it('does not mutate the input', () => {
        const copy = [...records];

        filterAttendanceRecords(records, 'late', 'x');

        expect(records).toEqual(copy);
    });
});

describe('buildYearOptions', () => {
    it('returns current year plus and minus two, ascending', () => {
        expect(buildYearOptions(2026, 2026)).toEqual([
            2024, 2025, 2026, 2027, 2028,
        ]);
    });

    it('keeps an out-of-range selected year selectable', () => {
        expect(buildYearOptions(2019, 2026)).toEqual([
            2019, 2024, 2025, 2026, 2027, 2028,
        ]);
    });
});

describe('isFutureWorkDate', () => {
    it('is true only for dates after today', () => {
        expect(isFutureWorkDate('2026-11-12', '2026-11-11')).toBe(true);
        expect(isFutureWorkDate('2026-11-11', '2026-11-11')).toBe(false);
        expect(isFutureWorkDate('2026-11-10', '2026-11-11')).toBe(false);
    });
});
