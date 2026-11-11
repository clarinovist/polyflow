import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    requireHrdFinance: vi.fn(),
    listByEmployee: vi.fn(),
    appSettingFindMany: vi.fn(),
    workShiftFindMany: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        appSetting: { findMany: mocks.appSettingFindMany },
        workShift: { findMany: mocks.workShiftFindMany },
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

import { listAttendanceByEmployee } from '../attendance-employee';

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
