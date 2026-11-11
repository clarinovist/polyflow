import { describe, expect, it } from 'vitest';
import type { AttendanceRecordResult } from '../attendance-service';
import {
    readConfiguredRadius,
    withAttendanceFlags,
    type AttendanceFlagContext,
} from '../attendance-query-service';

const WORK_DATE = '2026-11-10';
const VALID_PHOTO = '/api/images/acme/attendance/emp-1/in-1.jpg';

const record = (
    overrides: Partial<AttendanceRecordResult> = {},
): AttendanceRecordResult =>
    ({
        id: 'r-1',
        employeeId: 'emp-1',
        workShiftId: 'shift-1',
        status: 'PRESENT',
        // 07:00 WIB = 00:00 UTC
        clockInAt: new Date('2026-11-10T00:00:00.000Z'),
        clockInPhotoUrl: VALID_PHOTO,
        clockInDistance: 20,
        ...overrides,
    }) as AttendanceRecordResult;

const context = (
    overrides: Partial<AttendanceFlagContext> = {},
): AttendanceFlagContext => ({
    workDate: WORK_DATE,
    graceMinutes: 10,
    radiusMeters: 100,
    shiftStartTimes: new Map([['shift-1', '07:00']]),
    ...overrides,
});

const flagsOf = (r: AttendanceRecordResult, ctx = context()) => {
    const [result] = withAttendanceFlags([r], ctx);
    return {
        isLate: result.isLate,
        isOutsideRadius: result.isOutsideRadius,
        hasValidSelfie: result.hasValidSelfie,
    };
};

describe('withAttendanceFlags', () => {
    it('keeps the original record fields and adds the derived flags', () => {
        const [result] = withAttendanceFlags([record()], context());

        expect(result).toMatchObject({ id: 'r-1', employeeId: 'emp-1' });
        expect(Object.keys(result)).toEqual(
            expect.arrayContaining([
                'isLate',
                'isOutsideRadius',
                'hasValidSelfie',
            ]),
        );
    });

    it('does not mutate the input records', () => {
        const input = record();

        withAttendanceFlags([input], context());

        expect(input).not.toHaveProperty('isLate');
    });

    describe('isLate', () => {
        it('is false when clocked in exactly at shift start', () => {
            expect(flagsOf(record()).isLate).toBe(false);
        });

        it('is false within the grace period (07:10 with 10 minutes grace)', () => {
            const r = record({
                clockInAt: new Date('2026-11-10T00:10:00.000Z'),
            });

            expect(flagsOf(r).isLate).toBe(false);
        });

        it('is true past the grace period (07:11 with 10 minutes grace)', () => {
            const r = record({
                clockInAt: new Date('2026-11-10T00:11:00.000Z'),
            });

            expect(flagsOf(r).isLate).toBe(true);
        });

        it('uses the grace from settings', () => {
            const r = record({
                clockInAt: new Date('2026-11-10T00:11:00.000Z'),
            });

            expect(flagsOf(r, context({ graceMinutes: 15 })).isLate).toBe(
                false,
            );
        });

        it('is false for non-PRESENT records even with a late clockInAt', () => {
            const r = record({
                status: 'ABSENT',
                clockInAt: new Date('2026-11-10T03:00:00.000Z'),
            });

            expect(flagsOf(r).isLate).toBe(false);
        });

        it('is false when there is no clock-in time', () => {
            expect(flagsOf(record({ clockInAt: null })).isLate).toBe(false);
        });

        it('is false when the shift start time is unknown', () => {
            const ctx = context({ shiftStartTimes: new Map() });
            const r = record({
                clockInAt: new Date('2026-11-10T03:00:00.000Z'),
            });

            expect(flagsOf(r, ctx).isLate).toBe(false);
        });
    });

    describe('isOutsideRadius', () => {
        it('is true when the clock-in distance exceeds the configured radius', () => {
            expect(
                flagsOf(record({ clockInDistance: 100.5 })).isOutsideRadius,
            ).toBe(true);
        });

        it('is false at exactly the radius', () => {
            expect(
                flagsOf(record({ clockInDistance: 100 })).isOutsideRadius,
            ).toBe(false);
        });

        it('is false when no distance was recorded', () => {
            expect(
                flagsOf(record({ clockInDistance: null })).isOutsideRadius,
            ).toBe(false);
        });

        it('is false when the radius is not configured', () => {
            const r = record({ clockInDistance: 5000 });

            expect(
                flagsOf(r, context({ radiusMeters: null })).isOutsideRadius,
            ).toBe(false);
        });
    });

    describe('hasValidSelfie', () => {
        it('is true for an internal attendance photo path', () => {
            expect(flagsOf(record()).hasValidSelfie).toBe(true);
        });

        it.each([
            ['missing', null],
            ['external', 'https://example.com/a.jpg'],
            ['traversal', '/api/images/acme/attendance/emp-1/../x.jpg'],
        ])('is false for a %s photo URL', (_label, url) => {
            expect(
                flagsOf(record({ clockInPhotoUrl: url })).hasValidSelfie,
            ).toBe(false);
        });
    });
});

describe('readConfiguredRadius', () => {
    it('returns the radius as a number', () => {
        expect(
            readConfiguredRadius({ 'attendance.radiusMeters': '150' }),
        ).toBe(150);
    });

    it.each([
        ['missing', {}],
        ['null', { 'attendance.radiusMeters': null }],
        ['empty', { 'attendance.radiusMeters': '' }],
        ['zero', { 'attendance.radiusMeters': '0' }],
        ['negative', { 'attendance.radiusMeters': '-5' }],
        ['not a number', { 'attendance.radiusMeters': 'abc' }],
    ])('returns null when the radius is %s', (_label, settings) => {
        expect(readConfiguredRadius(settings)).toBeNull();
    });
});
