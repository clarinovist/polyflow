import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    readAttendanceTodaySnapshot,
    resolveAnomalyRadiusMeters,
    summarizeAttendanceToday,
    type AttendanceTodayRecord,
} from '../hrd-dashboard-attendance';

// Contract of the T1 helper (stale-session.ts): cutoff = now - 20h.
vi.mock('@/services/hrd/stale-session', () => ({
    STALE_SESSION_HOURS: 20,
    staleSessionCutoff: (now: Date) =>
        new Date(now.getTime() - 20 * 60 * 60 * 1000),
}));

const WORK_DATE = '2026-10-10'; // Saturday
const SUNDAY = '2026-10-11';
const VALID_PHOTO = '/api/images/tenant_a/attendance/emp-1/clock-in.jpg';

function record(
    overrides: Partial<AttendanceTodayRecord> & { employeeId: string },
): AttendanceTodayRecord {
    return {
        status: 'PRESENT',
        clockInAt: new Date('2026-10-10T00:55:00.000Z'), // 07:55 WIB
        clockInDistance: 10,
        clockInPhotoUrl: VALID_PHOTO,
        overtimeHours: 0,
        workShift: { startTime: '08:00' },
        ...overrides,
    };
}

function summarize(
    records: AttendanceTodayRecord[],
    overrides: Partial<Parameters<typeof summarizeAttendanceToday>[0]> = {},
) {
    return summarizeAttendanceToday({
        records,
        eligibleHeadcount: 10,
        workDate: WORK_DATE,
        graceMinutes: 0,
        radiusMeters: null,
        staleOpen: 0,
        ...overrides,
    });
}

describe('summarizeAttendanceToday', () => {
    it('counts one employee once even with two shift records', () => {
        const result = summarize([
            record({ employeeId: 'a' }),
            record({ employeeId: 'a', workShift: { startTime: '16:00' } }),
        ]);

        expect(result.present).toBe(1);
        expect(result.noRecord).toBe(9);
    });

    it('prefers PRESENT over ON_LEAVE over ABSENT for the same employee', () => {
        const result = summarize([
            record({ employeeId: 'a', status: 'ABSENT' }),
            record({ employeeId: 'a', status: 'PRESENT' }),
            record({ employeeId: 'b', status: 'ABSENT' }),
            record({ employeeId: 'b', status: 'ON_LEAVE' }),
            record({ employeeId: 'c', status: 'ABSENT' }),
        ]);

        expect(result).toMatchObject({ present: 1, onLeave: 1, absent: 1 });
    });

    it('makes present + absent + onLeave + noRecord equal the headcount on a working day', () => {
        const result = summarize(
            [
                record({ employeeId: 'a' }),
                record({ employeeId: 'b', status: 'ABSENT' }),
                record({ employeeId: 'c', status: 'ON_LEAVE' }),
            ],
            { eligibleHeadcount: 7 },
        );

        expect(
            result.present + result.absent + result.onLeave + result.noRecord,
        ).toBe(7);
        expect(result.noRecord).toBe(4);
        expect(result.isNonWorkingDay).toBe(false);
    });

    it('never reports a negative noRecord when records outnumber the headcount', () => {
        const result = summarize([record({ employeeId: 'a' })], {
            eligibleHeadcount: 0,
        });

        expect(result.noRecord).toBe(0);
    });

    it('reports noRecord 0 and isNonWorkingDay on Sunday', () => {
        const result = summarize([record({ employeeId: 'a' })], {
            workDate: SUNDAY,
            eligibleHeadcount: 10,
        });

        expect(result.noRecord).toBe(0);
        expect(result.isNonWorkingDay).toBe(true);
        expect(result.present).toBe(1);
    });

    it('counts late with the grace window and keeps late a subset of present', () => {
        const result = summarize(
            [
                // 08:04 WIB, grace 5 -> on time
                record({
                    employeeId: 'a',
                    clockInAt: new Date('2026-10-10T01:04:00.000Z'),
                }),
                // 08:06 WIB, grace 5 -> late
                record({
                    employeeId: 'b',
                    clockInAt: new Date('2026-10-10T01:06:00.000Z'),
                }),
                // ABSENT rows are never late even with a clockInAt
                record({
                    employeeId: 'c',
                    status: 'ABSENT',
                    clockInAt: new Date('2026-10-10T05:00:00.000Z'),
                }),
            ],
            { graceMinutes: 5 },
        );

        expect(result.late).toBe(1);
        expect(result.late).toBeLessThanOrEqual(result.present);
    });

    it('counts a two-shift employee late once', () => {
        const result = summarize([
            record({
                employeeId: 'a',
                clockInAt: new Date('2026-10-10T01:30:00.000Z'),
            }),
            record({
                employeeId: 'a',
                workShift: { startTime: '16:00' },
                clockInAt: new Date('2026-10-10T09:30:00.000Z'),
            }),
        ]);

        expect(result.late).toBe(1);
    });

    it('does not count a PRESENT row without clockInAt as late', () => {
        const result = summarize([
            record({ employeeId: 'a', clockInAt: null }),
        ]);

        expect(result.late).toBe(0);
    });

    it('flags outside radius only when a radius is configured', () => {
        const far = record({ employeeId: 'a', clockInDistance: 250 });
        const near = record({ employeeId: 'b', clockInDistance: 80 });
        const unmeasured = record({ employeeId: 'c', clockInDistance: null });

        expect(summarize([far, near, unmeasured], { radiusMeters: 100 }))
            .toMatchObject({ outsideRadius: 1 });
        expect(summarize([far, near, unmeasured], { radiusMeters: null }))
            .toMatchObject({ outsideRadius: 0 });
    });

    it('accepts Prisma Decimal-like distances', () => {
        const result = summarize(
            [
                record({
                    employeeId: 'a',
                    clockInDistance: { valueOf: () => '150.5' } as never,
                }),
            ],
            { radiusMeters: 100 },
        );

        expect(result.outsideRadius).toBe(1);
    });

    it('counts PRESENT records without a valid selfie once per employee', () => {
        const result = summarize([
            record({ employeeId: 'a', clockInPhotoUrl: null }),
            record({
                employeeId: 'a',
                workShift: { startTime: '16:00' },
                clockInPhotoUrl: 'https://evil.example/x.jpg',
            }),
            record({ employeeId: 'b' }),
            record({ employeeId: 'c', status: 'ABSENT', clockInPhotoUrl: null }),
        ]);

        expect(result.noSelfie).toBe(1);
    });

    it('sums PRESENT overtime across records and ignores non-PRESENT rows', () => {
        const result = summarize([
            record({ employeeId: 'a', overtimeHours: 1.1 }),
            record({ employeeId: 'a', overtimeHours: 2.23 }),
            record({ employeeId: 'b', overtimeHours: null }),
            record({ employeeId: 'c', status: 'ABSENT', overtimeHours: 9 }),
        ]);

        expect(result.overtimeHours).toBe(3.33);
    });

    it('returns valid zeroes for an empty day', () => {
        expect(summarize([], { eligibleHeadcount: 0 })).toEqual({
            present: 0,
            absent: 0,
            onLeave: 0,
            noRecord: 0,
            late: 0,
            outsideRadius: 0,
            noSelfie: 0,
            overtimeHours: 0,
            isNonWorkingDay: false,
            staleOpen: 0,
        });
    });

    it('passes the staleOpen input through unchanged, also on Sunday', () => {
        expect(summarize([], { staleOpen: 4 }).staleOpen).toBe(4);
        expect(
            summarize([], { staleOpen: 2, workDate: SUNDAY }).staleOpen,
        ).toBe(2);
    });
});

describe('resolveAnomalyRadiusMeters', () => {
    it('returns the radius when geofence mode is observe or enforce', () => {
        expect(
            resolveAnomalyRadiusMeters({
                'attendance.geofenceMode': 'observe',
                'attendance.radiusMeters': '120',
            }),
        ).toBe(120);
        expect(
            resolveAnomalyRadiusMeters({
                'attendance.geofenceMode': 'enforce',
                'attendance.radiusMeters': '75',
            }),
        ).toBe(75);
    });

    it('returns null when geofence is off or the radius is missing or invalid', () => {
        expect(
            resolveAnomalyRadiusMeters({
                'attendance.geofenceMode': 'off',
                'attendance.radiusMeters': '100',
            }),
        ).toBeNull();
        expect(
            resolveAnomalyRadiusMeters({
                'attendance.geofenceMode': 'observe',
                'attendance.radiusMeters': '',
            }),
        ).toBeNull();
        expect(
            resolveAnomalyRadiusMeters({
                'attendance.geofenceMode': 'observe',
                'attendance.radiusMeters': '-5',
            }),
        ).toBeNull();
        expect(resolveAnomalyRadiusMeters({})).toBeNull();
    });
});

describe('readAttendanceTodaySnapshot', () => {
    const db = {
        employee: { count: vi.fn() },
        attendanceRecord: { findMany: vi.fn(), groupBy: vi.fn() },
        appSetting: { findMany: vi.fn() },
    };

    beforeEach(() => {
        vi.resetAllMocks();
        db.employee.count.mockResolvedValue(5);
        db.attendanceRecord.findMany.mockResolvedValue([]);
        db.attendanceRecord.groupBy.mockResolvedValue([]);
        db.appSetting.findMany.mockResolvedValue([
            { key: 'attendance.lateGraceMinutes', value: '10' },
            { key: 'attendance.geofenceMode', value: 'observe' },
            { key: 'attendance.radiusMeters', value: '100' },
        ]);
    });

    it('uses one record query, one headcount query and one settings query', async () => {
        db.attendanceRecord.findMany.mockResolvedValue([
            record({ employeeId: 'a', clockInDistance: 500 }),
            record({ employeeId: 'b', clockInAt: new Date('2026-10-10T01:15:00.000Z') }),
        ]);

        const result = await readAttendanceTodaySnapshot(
            db as never,
            new Date('2026-10-10T00:00:00.000Z'),
        );

        expect(result).toMatchObject({
            present: 2,
            noRecord: 3,
            late: 1,
            outsideRadius: 1,
        });
        expect(db.attendanceRecord.findMany).toHaveBeenCalledTimes(1);
        expect(db.employee.count).toHaveBeenCalledTimes(1);
        expect(db.appSetting.findMany).toHaveBeenCalledTimes(1);
    });

    it('limits the headcount to ACTIVE employees already joined on that date', async () => {
        await readAttendanceTodaySnapshot(
            db as never,
            new Date('2026-10-10T00:00:00.000Z'),
        );

        expect(db.employee.count).toHaveBeenCalledWith({
            where: {
                status: 'ACTIVE',
                OR: [
                    { joinDate: null },
                    { joinDate: { lt: new Date('2026-10-11T00:00:00.000+07:00') } },
                ],
            },
        });
    });

    it('selects only the fields needed and filters by work date', async () => {
        await readAttendanceTodaySnapshot(
            db as never,
            new Date('2026-10-10T00:00:00.000Z'),
        );

        expect(db.attendanceRecord.findMany).toHaveBeenCalledWith({
            where: { workDate: new Date('2026-10-10T00:00:00.000Z') },
            select: {
                employeeId: true,
                status: true,
                clockInAt: true,
                clockInDistance: true,
                clockInPhotoUrl: true,
                overtimeHours: true,
                workShift: { select: { startTime: true } },
            },
        });
    });

    it('skips the headcount query on Sunday', async () => {
        const result = await readAttendanceTodaySnapshot(
            db as never,
            new Date('2026-10-11T00:00:00.000Z'),
        );

        expect(result.isNonWorkingDay).toBe(true);
        expect(result.noRecord).toBe(0);
        expect(db.employee.count).not.toHaveBeenCalled();
    });

    it('rejects instead of returning zeroes when the settings read fails', async () => {
        db.appSetting.findMany.mockRejectedValue(new Error('settings down'));

        await expect(
            readAttendanceTodaySnapshot(
                db as never,
                new Date('2026-10-10T00:00:00.000Z'),
            ),
        ).rejects.toThrow('settings down');
    });

    describe('staleOpen', () => {
        const NOW = new Date('2026-10-10T05:00:00.000Z');
        const DAY = new Date('2026-10-10T00:00:00.000Z');

        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(NOW);
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('counts distinct employees: two stale sessions of one person count once', async () => {
            db.attendanceRecord.groupBy.mockResolvedValue([
                { employeeId: 'a' },
                { employeeId: 'b' },
            ]);

            const result = await readAttendanceTodaySnapshot(db as never, DAY);

            expect(result.staleOpen).toBe(2);
        });

        it('uses exactly one extra query, grouped by employee', async () => {
            await readAttendanceTodaySnapshot(db as never, DAY);

            expect(db.attendanceRecord.groupBy).toHaveBeenCalledTimes(1);
            expect(db.attendanceRecord.findMany).toHaveBeenCalledTimes(1);
            expect(db.attendanceRecord.groupBy.mock.calls[0][0].by).toEqual([
                'employeeId',
            ]);
        });

        it('filters open sessions older than 20 hours within the last 60 days', async () => {
            await readAttendanceTodaySnapshot(db as never, DAY);

            const { where } = db.attendanceRecord.groupBy.mock.calls[0][0];
            expect(where.clockOutAt).toBeNull();
            expect(where.clockInAt.not).toBeNull();
            // 20 hours before "now": the exact boundary is excluded (lt).
            expect(where.clockInAt.lt).toEqual(
                new Date('2026-10-09T09:00:00.000Z'),
            );
            expect(where.workDate.gte).toEqual(
                new Date('2026-08-11T00:00:00.000Z'),
            );
        });

        it('does not filter by the displayed day and still counts on Sunday', async () => {
            db.attendanceRecord.groupBy.mockResolvedValue([
                { employeeId: 'a' },
            ]);

            const result = await readAttendanceTodaySnapshot(
                db as never,
                new Date('2026-10-11T00:00:00.000Z'),
            );

            expect(result.isNonWorkingDay).toBe(true);
            expect(result.staleOpen).toBe(1);
            expect(db.attendanceRecord.groupBy).toHaveBeenCalledTimes(1);
        });

        it('rejects instead of falling back to zero when the stale query fails', async () => {
            db.attendanceRecord.groupBy.mockRejectedValue(new Error('stale down'));

            await expect(
                readAttendanceTodaySnapshot(db as never, DAY),
            ).rejects.toThrow('stale down');
        });
    });
});
