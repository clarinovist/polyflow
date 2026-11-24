import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    requireHrdFinance: vi.fn(),
    listByEmployee: vi.fn(),
    appSettingFindMany: vi.fn(),
    workShiftFindMany: vi.fn(),
    employeeFindUnique: vi.fn(),
    leaveRequestFindMany: vi.fn(),
    attendanceRecordFindMany: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        appSetting: { findMany: mocks.appSettingFindMany },
        workShift: { findMany: mocks.workShiftFindMany },
        employee: { findUnique: mocks.employeeFindUnique },
        leaveRequest: { findMany: mocks.leaveRequestFindMany },
        attendanceRecord: { findMany: mocks.attendanceRecordFindMany },
    },
}));
vi.mock('@/lib/auth/hrd-access', () => ({
    requireHrdFinance: mocks.requireHrdFinance,
}));
vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/hrd/attendance-service', () => ({
    AttendanceService: { listByEmployee: mocks.listByEmployee },
}));

import {
    getEmployeeAttendanceCalendar,
    getEmployeeAttendanceTrend,
    listAttendanceByEmployee,
} from '../attendance-employee';

const VALID_SELFIE = '/api/images/tenant-x/attendance/e-1/selfie.jpg';

function record(i: number, overrides: Record<string, unknown> = {}) {
    const day = String((i % 28) + 1).padStart(2, '0');
    return {
        id: `r-${i}`,
        workDate: new Date(`2026-05-${day}T00:00:00Z`),
        workShiftId: 'shift-1',
        status: 'PRESENT',
        // 08:00 WIB = 01:00 UTC; shift starts 08:00
        clockInAt: new Date(`2026-05-${day}T01:00:00Z`),
        clockInDistance: 10,
        clockInPhotoUrl: VALID_SELFIE,
        ...overrides,
    };
}

function queryCalls() {
    return (
        mocks.appSettingFindMany.mock.calls.length +
        mocks.workShiftFindMany.mock.calls.length
    );
}

describe('listAttendanceByEmployee', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireHrdFinance.mockResolvedValue({ user: { role: 'HRD' } });
        mocks.appSettingFindMany.mockResolvedValue([
            { key: 'attendance.radiusMeters', value: '100' },
            { key: 'attendance.lateGraceMinutes', value: '5' },
        ]);
        mocks.workShiftFindMany.mockResolvedValue([
            { id: 'shift-1', startTime: '08:00' },
        ]);
    });

    it('rejects unauthorized roles without reading anything', async () => {
        mocks.requireHrdFinance.mockRejectedValue(new Error('Forbidden'));

        const res = await listAttendanceByEmployee('e-1');

        expect(res.success).toBe(false);
        expect(mocks.listByEmployee).not.toHaveBeenCalled();
        expect(queryCalls()).toBe(0);
    });

    it('adds isLate, isOutsideRadius and hasValidSelfie per record', async () => {
        mocks.listByEmployee.mockResolvedValue([
            record(0),
            record(1, {
                clockInAt: new Date('2026-05-02T01:30:00Z'),
                clockInDistance: 500,
                clockInPhotoUrl: 'https://evil.example/x.jpg',
            }),
        ]);

        const res = await listAttendanceByEmployee('e-1');

        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data[0]).toMatchObject({
            isLate: false,
            isOutsideRadius: false,
            hasValidSelfie: true,
        });
        expect(res.data[1]).toMatchObject({
            isLate: true,
            isOutsideRadius: true,
            hasValidSelfie: false,
        });
    });

    it('uses the same number of queries for 1 and 20 records', async () => {
        mocks.listByEmployee.mockResolvedValue([record(0)]);
        await listAttendanceByEmployee('e-1');
        const oneRecordCalls = queryCalls();

        vi.clearAllMocks();
        mocks.requireHrdFinance.mockResolvedValue({});
        mocks.appSettingFindMany.mockResolvedValue([]);
        mocks.workShiftFindMany.mockResolvedValue([
            { id: 'shift-1', startTime: '08:00' },
        ]);
        mocks.listByEmployee.mockResolvedValue(
            Array.from({ length: 20 }, (_, i) => record(i)),
        );
        await listAttendanceByEmployee('e-1');

        expect(oneRecordCalls).toBe(2);
        expect(queryCalls()).toBe(oneRecordCalls);
        expect(mocks.workShiftFindMany).toHaveBeenCalledTimes(1);
    });

    it('returns an honest error when settings cannot be read', async () => {
        mocks.listByEmployee.mockResolvedValue([record(0)]);
        mocks.appSettingFindMany.mockRejectedValue(new Error('db down'));

        const res = await listAttendanceByEmployee('e-1');

        expect(res.success).toBe(false);
    });

    it('returns an empty list without settings queries when there are no records', async () => {
        mocks.listByEmployee.mockResolvedValue([]);

        const res = await listAttendanceByEmployee('e-1');

        expect(res).toEqual({ success: true, data: [] });
        expect(queryCalls()).toBe(0);
    });
});

describe('getEmployeeAttendanceCalendar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-05-10T05:00:00Z'));
        mocks.requireHrdFinance.mockResolvedValue({ user: { role: 'HRD' } });
        mocks.employeeFindUnique.mockResolvedValue({
            id: 'e-1',
            status: 'ACTIVE',
            joinDate: new Date('2026-01-01T00:00:00Z'),
        });
        mocks.appSettingFindMany.mockResolvedValue([
            { key: 'attendance.lateGraceMinutes', value: '5' },
        ]);
        mocks.workShiftFindMany.mockResolvedValue([
            { id: 'shift-1', startTime: '08:00' },
        ]);
        mocks.leaveRequestFindMany.mockResolvedValue([]);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('rejects unauthorized roles without touching DB', async () => {
        mocks.requireHrdFinance.mockRejectedValue(new Error('Forbidden'));
        const res = await getEmployeeAttendanceCalendar('e-1', 2026, 5);
        expect(res.success).toBe(false);
        expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
    });

    it('validates employeeId, year, and month', async () => {
        expect((await getEmployeeAttendanceCalendar('', 2026, 5)).success).toBe(false);
        expect((await getEmployeeAttendanceCalendar('e-1', 1999, 5)).success).toBe(false);
        expect((await getEmployeeAttendanceCalendar('e-1', 2026, 13)).success).toBe(false);
        expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
    });

    it('returns NotFound when employee does not exist', async () => {
        mocks.employeeFindUnique.mockResolvedValue(null);
        const res = await getEmployeeAttendanceCalendar('missing', 2026, 5);
        expect(res.success).toBe(false);
        if (!res.success) expect(res.error).toContain('Karyawan tidak ditemukan');
    });

    it('returns calendar days and summary matching records, late flags, and approved leaves', async () => {
        mocks.listByEmployee.mockResolvedValue([
            record(0),
            record(1, { clockInAt: new Date('2026-05-02T01:30:00Z') }),
        ]);
        mocks.leaveRequestFindMany.mockResolvedValue([
            {
                type: 'SICK',
                startDate: new Date('2026-05-04T00:00:00Z'),
                endDate: new Date('2026-05-04T00:00:00Z'),
            },
        ]);

        const res = await getEmployeeAttendanceCalendar('e-1', 2026, 5);
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.employeeStatus).toBe('ACTIVE');
        expect(res.data.days).toHaveLength(31);
        expect(res.data.summary.presentDays).toBe(2);
        expect(res.data.summary.lateDays).toBe(1);
        expect(res.data.summary.onTimeDays).toBe(1);
        expect(res.data.summary.paidLeaveDays).toBe(1);
    });
});

describe('getEmployeeAttendanceTrend', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-05-10T05:00:00Z'));
        mocks.requireHrdFinance.mockResolvedValue({ user: { role: 'HRD' } });
        mocks.employeeFindUnique.mockResolvedValue({
            id: 'e-1',
            status: 'ACTIVE',
            joinDate: new Date('2025-01-01T00:00:00Z'),
        });
        mocks.attendanceRecordFindMany.mockResolvedValue([]);
        mocks.leaveRequestFindMany.mockResolvedValue([]);
        mocks.appSettingFindMany.mockResolvedValue([
            { key: 'attendance.lateGraceMinutes', value: '5' },
        ]);
        mocks.workShiftFindMany.mockResolvedValue([
            { id: 'shift-1', startTime: '08:00' },
        ]);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('rejects unauthorized roles and invalid months', async () => {
        expect((await getEmployeeAttendanceTrend('e-1', 0)).success).toBe(false);
        expect((await getEmployeeAttendanceTrend('e-1', 13)).success).toBe(false);

        mocks.requireHrdFinance.mockRejectedValue(new Error('Forbidden'));
        expect((await getEmployeeAttendanceTrend('e-1', 6)).success).toBe(false);
        expect(mocks.employeeFindUnique).not.toHaveBeenCalled();
    });

    it('skips settings/shift queries when there are no records in the range', async () => {
        const res = await getEmployeeAttendanceTrend('e-1', 6);
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.points).toHaveLength(6);
        expect(queryCalls()).toBe(0);
    });

    it('returns 6 monthly points with late counts when records exist', async () => {
        mocks.attendanceRecordFindMany.mockResolvedValue([
            {
                workDate: new Date('2026-05-02T00:00:00Z'),
                status: 'PRESENT',
                clockInAt: new Date('2026-05-02T01:30:00Z'),
                workShiftId: 'shift-1',
            },
        ]);

        const res = await getEmployeeAttendanceTrend('e-1', 6);
        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(res.data.points).toHaveLength(6);
        expect(res.data.points[5]).toMatchObject({
            year: 2026,
            month: 5,
            lateDays: 1,
            onTimeDays: 0,
            presentDays: 1,
        });
    });

    it('surfaces DB failures honestly', async () => {
        mocks.attendanceRecordFindMany.mockRejectedValue(new Error('db down'));
        const res = await getEmployeeAttendanceTrend('e-1', 6);
        expect(res.success).toBe(false);
    });
});
