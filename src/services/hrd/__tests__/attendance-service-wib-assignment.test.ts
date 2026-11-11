import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AttendanceService } from '../attendance-service';

type AssignmentRow = {
    workShiftId: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    workShift: ShiftRow;
};
type ShiftRow = {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    plannedHours: null;
    status: 'ACTIVE';
};

const mockDb = {
    employee: { findUnique: vi.fn() },
    workShift: { findUnique: vi.fn(), findMany: vi.fn() },
    employeeShiftAssignment: { findFirst: vi.fn() },
    attendanceRecord: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    },
};

vi.mock('../pin-helpers', () => ({
    verifyPin: vi.fn(),
}));

import { verifyPin } from '../pin-helpers';

const PHOTO_URL = '/api/images/test/attendance/emp-1/clock_in-1.jpg';
// 00:30 WIB on 2026-08-20 == 17:30 UTC on 2026-08-19.
const AT_0030_WIB = new Date('2026-08-19T17:30:00.000Z');
// 23:30 WIB on 2026-08-20 == 16:30 UTC on 2026-08-20.
const AT_2330_WIB = new Date('2026-08-20T16:30:00.000Z');
const WIB_DAY = new Date('2026-08-20T00:00:00.000Z');
const OBSERVE_SETTINGS = { 'attendance.geofenceMode': 'observe' };

function dec(n: number) {
    return { toNumber: () => n, valueOf: () => n } as any;
}

const activeEmployee = {
    id: 'emp-1',
    name: 'Budi',
    code: 'EMP-001',
    pinHash: 'hashed',
    status: 'ACTIVE',
    payType: 'DAILY',
    dailyRate: dec(100000),
    overtimeHourlyRate: dec(187500),
    standardDayHours: dec(8),
};

function makeShift(id: string, name: string): ShiftRow {
    return {
        id,
        name,
        startTime: '00:00',
        endTime: '08:00',
        plannedHours: null,
        status: 'ACTIVE',
    };
}

const oldShift = makeShift('shift-old', 'Shift Lama');
const newShift = makeShift('shift-new', 'Shift Baru');

/** Old assignment ended 2026-08-19; the new one starts 2026-08-20 (date-only columns). */
const assignments: AssignmentRow[] = [
    {
        workShiftId: oldShift.id,
        effectiveFrom: new Date('2026-08-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-08-19T00:00:00.000Z'),
        workShift: oldShift,
    },
    {
        workShiftId: newShift.id,
        effectiveFrom: WIB_DAY,
        effectiveTo: null,
        workShift: newShift,
    },
];

/** Mimics the Prisma where/orderBy the service sends, against date-only columns. */
function armAssignmentLookup() {
    vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockImplementation(
        async (arg: any) => {
            const lte: Date = arg.where.effectiveFrom.lte;
            const matches = assignments.filter((a) => {
                if (a.effectiveFrom.getTime() > lte.getTime()) return false;
                if (a.effectiveTo === null) return true;
                const gte = arg.where.OR[1].effectiveTo.gte as Date;
                return a.effectiveTo.getTime() >= gte.getTime();
            });
            const sorted = [...matches].sort(
                (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
            );
            return sorted[0] ?? null;
        },
    );
}

function recordFor(shift: ShiftRow, overrides: Record<string, unknown> = {}) {
    return {
        id: 'rec-1',
        employeeId: 'emp-1',
        workDate: WIB_DAY,
        workShiftId: shift.id,
        clockInAt: new Date(),
        clockOutAt: null,
        isOvertimeShift: false,
        status: 'PRESENT',
        source: 'KIOSK',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        dailyEarnings: dec(0),
        overtimeEarnings: dec(0),
        totalEarnings: dec(0),
        plannedHours: dec(8),
        actualHours: null,
        regularHours: dec(0),
        overtimeHours: dec(0),
        clockInPhotoUrl: PHOTO_URL,
        clockOutPhotoUrl: null,
        employee: { name: 'Budi', code: 'EMP-001' },
        workShift: shift,
        ...overrides,
    } as any;
}

function armClockInCapture(shiftById: ShiftRow[]) {
    vi.mocked(mockDb.employee.findUnique).mockResolvedValue(
        activeEmployee as any,
    );
    vi.mocked(verifyPin).mockResolvedValue(true);
    vi.mocked(mockDb.workShift.findUnique).mockImplementation(
        async (arg: any) =>
            shiftById.find((s) => s.id === arg.where.id) ?? null,
    );
    vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);
    vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null);
    vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(0);
    const captured: { data: any } = { data: null };
    vi.mocked(mockDb.attendanceRecord.create).mockImplementation(
        async (arg: any) => {
            captured.data = arg.data;
            const shift =
                shiftById.find((s) => s.id === arg.data.workShiftId) ??
                shiftById[0];
            return recordFor(shift, {
                source: arg.data.source,
                clockInLatitude: arg.data.clockInLatitude,
                clockInLongitude: arg.data.clockInLongitude,
                clockInAccuracy: arg.data.clockInAccuracy,
                clockInDistance: arg.data.clockInDistance,
            });
        },
    );
    return captured;
}

describe('AttendanceService - WIB day for shift assignment lookup', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        armAssignmentLookup();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    describe.each([
        ['00:30 WIB', AT_0030_WIB, newShift],
        ['23:30 WIB', AT_2330_WIB, newShift],
    ])('at %s', (_label, instant, expectedShift) => {
        it('kiosk clockIn resolves the assignment starting on the WIB day', async () => {
            vi.setSystemTime(instant);
            armClockInCapture([oldShift, newShift]);

            const result = await AttendanceService.clockIn(
                mockDb as any,
                {
                    employeeCode: 'EMP-001',
                    pin: '1234',
                    clockInPhotoUrl: PHOTO_URL,
                },
                {},
            );

            expect(mockDb.employeeShiftAssignment.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        effectiveFrom: { lte: WIB_DAY },
                    }),
                }),
            );
            expect(result.shiftName).toBe(expectedShift.name);
            expect(mockDb.workShift.findMany).not.toHaveBeenCalled();
        });

        it('clockInSelfService resolves the assignment starting on the WIB day', async () => {
            vi.setSystemTime(instant);
            const captured = armClockInCapture([oldShift, newShift]);

            const result = await AttendanceService.clockInSelfService(
                mockDb as any,
                {
                    employeeId: 'emp-1',
                    clockInPhotoUrl: PHOTO_URL,
                    locationEvidence: {
                        latitude: -6.2,
                        longitude: 106.8,
                        accuracy: 10,
                    },
                },
                { 'attendance.geofenceEnabled': 'false' },
            );

            expect(captured.data.workShiftId).toBe(expectedShift.id);
            expect(result.shiftName).toBe(expectedShift.name);
        });

        it('getMyTodayStatus reports the assignment starting on the WIB day', async () => {
            vi.setSystemTime(instant);
            vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([]);
            vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);

            const status = await AttendanceService.getMyTodayStatus(
                mockDb as any,
                'emp-1',
            );

            expect(status.status).toBe('NOT_CLOCKED_IN');
            expect(status.shiftName).toBe(expectedShift.name);
        });
    });

    it('keeps the old assignment on the last WIB day before the switch (23:30 WIB, day before)', async () => {
        vi.setSystemTime(new Date('2026-08-19T16:30:00.000Z')); // 23:30 WIB Aug 19
        vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([]);
        vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);

        const status = await AttendanceService.getMyTodayStatus(
            mockDb as any,
            'emp-1',
        );

        expect(status.shiftName).toBe(oldShift.name);
    });
});

describe('AttendanceService - self-service observe mode without location evidence', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(AT_2330_WIB);
        armAssignmentLookup();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('clockInSelfService succeeds and stores no location when evidence is missing', async () => {
        const captured = armClockInCapture([oldShift, newShift]);

        const result = await AttendanceService.clockInSelfService(
            mockDb as any,
            {
                employeeId: 'emp-1',
                clockInPhotoUrl: PHOTO_URL,
            } as any,
            OBSERVE_SETTINGS,
        );

        expect(result.employeeName).toBe('Budi');
        expect(captured.data.clockInLatitude).toBeNull();
        expect(captured.data.clockInLongitude).toBeNull();
        expect(captured.data.clockInAccuracy).toBeNull();
        expect(captured.data.clockInDistance).toBeNull();
    });

    it('clockInSelfService still stores valid evidence in observe mode', async () => {
        const captured = armClockInCapture([oldShift, newShift]);

        await AttendanceService.clockInSelfService(
            mockDb as any,
            {
                employeeId: 'emp-1',
                clockInPhotoUrl: PHOTO_URL,
                locationEvidence: {
                    latitude: -6.12,
                    longitude: 106.12,
                    accuracy: 10,
                },
            },
            {
                ...OBSERVE_SETTINGS,
                'attendance.latitude': '-6.12',
                'attendance.longitude': '106.12',
                'attendance.radiusMeters': '100',
                'attendance.maxAccuracyMeters': '50',
            },
        );

        expect(Number(captured.data.clockInLatitude)).toBeCloseTo(-6.12, 5);
        expect(Number(captured.data.clockInLongitude)).toBeCloseTo(106.12, 5);
        expect(Number(captured.data.clockInAccuracy)).toBeCloseTo(10, 2);
        expect(Number(captured.data.clockInDistance)).toBeCloseTo(0, 1);
    });

    function armClockOut() {
        vi.mocked(mockDb.employee.findUnique).mockResolvedValue({
            id: 'emp-1',
            name: 'Budi',
            code: 'EMP-001',
            status: 'ACTIVE',
        } as any);
        const openShift = makeShift('shift-1', 'Shift 1');
        vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
            recordFor(openShift, {
                clockInAt: new Date(AT_2330_WIB.getTime() - 3 * 3600_000),
            }),
        ] as any);
        const updateCalls: any[] = [];
        vi.mocked(mockDb.attendanceRecord.update).mockImplementation(
            async (arg: any) => {
                updateCalls.push(arg.data);
                return recordFor(openShift, {
                    clockOutAt: new Date(),
                    actualHours: dec(3),
                    regularHours: dec(3),
                    clockOutLatitude: arg.data.clockOutLatitude,
                    clockOutLongitude: arg.data.clockOutLongitude,
                    clockOutAccuracy: arg.data.clockOutAccuracy,
                    clockOutDistance: arg.data.clockOutDistance,
                });
            },
        );
        return updateCalls;
    }

    it('clockOutSelfService succeeds and stores no location when evidence is missing', async () => {
        const updateCalls = armClockOut();

        const result = await AttendanceService.clockOutSelfService(
            mockDb as any,
            { employeeId: 'emp-1' } as any,
            OBSERVE_SETTINGS,
        );

        expect(result.employeeName).toBe('Budi');
        const geoWrite = updateCalls[0];
        expect(geoWrite.clockOutLatitude).toBeNull();
        expect(geoWrite.clockOutLongitude).toBeNull();
        expect(geoWrite.clockOutAccuracy).toBeNull();
        expect(geoWrite.clockOutDistance).toBeNull();
    });

    it('clockOutSelfService still stores valid evidence in observe mode', async () => {
        const updateCalls = armClockOut();

        await AttendanceService.clockOutSelfService(
            mockDb as any,
            {
                employeeId: 'emp-1',
                locationEvidence: {
                    latitude: -6.12,
                    longitude: 106.12,
                    accuracy: 12,
                },
            },
            OBSERVE_SETTINGS,
        );

        const geoWrite = updateCalls[0];
        expect(Number(geoWrite.clockOutLatitude)).toBeCloseTo(-6.12, 5);
        expect(Number(geoWrite.clockOutLongitude)).toBeCloseTo(106.12, 5);
        expect(Number(geoWrite.clockOutAccuracy)).toBeCloseTo(12, 2);
    });
});
