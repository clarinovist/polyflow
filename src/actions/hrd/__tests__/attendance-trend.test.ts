import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    requireHrdFinance: vi.fn(),
    attendanceFindMany: vi.fn(),
    employeeFindMany: vi.fn(),
    appSettingFindMany: vi.fn(),
}));

vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        attendanceRecord: { findMany: mocks.attendanceFindMany },
        employee: { findMany: mocks.employeeFindMany },
        appSetting: { findMany: mocks.appSettingFindMany },
    },
}));
vi.mock('@/lib/auth/hrd-access', () => ({
    requireHrdFinance: mocks.requireHrdFinance,
}));
vi.mock('@/lib/config/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { getHrdAttendanceTrend } from '../attendance-trend';

describe('getHrdAttendanceTrend', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireHrdFinance.mockResolvedValue({ user: { role: 'HRD' } });
        mocks.attendanceFindMany.mockResolvedValue([]);
        mocks.employeeFindMany.mockResolvedValue([
            { id: 'e1', joinDate: null },
            { id: 'e2', joinDate: null },
        ]);
        mocks.appSettingFindMany.mockResolvedValue([
            { key: 'attendance.lateGraceMinutes', value: '5' },
        ]);
    });

    it('rejects non-HRD/Finance roles without touching DB', async () => {
        mocks.requireHrdFinance.mockRejectedValue(new Error('Forbidden'));

        const res = await getHrdAttendanceTrend({
            from: '2026-07-01',
            to: '2026-07-07',
        });

        expect(res.success).toBe(false);
        expect(mocks.attendanceFindMany).not.toHaveBeenCalled();
        expect(mocks.employeeFindMany).not.toHaveBeenCalled();
    });

    it('rejects invalid, reversed, or >92-day ranges before querying DB', async () => {
        expect(
            (
                await getHrdAttendanceTrend({
                    from: '2026-02-30',
                    to: '2026-03-01',
                })
            ).success,
        ).toBe(false);
        expect(
            (
                await getHrdAttendanceTrend({
                    from: '2026-07-10',
                    to: '2026-07-01',
                })
            ).success,
        ).toBe(false);
        expect(
            (
                await getHrdAttendanceTrend({
                    from: '2026-07-01',
                    to: '2026-10-01',
                })
            ).success,
        ).toBe(false);
        expect(mocks.attendanceFindMany).not.toHaveBeenCalled();
    });

    it('queries records, active employees, and settings once in all-shifts mode', async () => {
        mocks.attendanceFindMany.mockResolvedValue([
            {
                employeeId: 'e1',
                workDate: new Date('2026-07-06T00:00:00Z'),
                status: 'PRESENT',
                clockInAt: new Date('2026-07-06T00:55:00Z'),
                workShift: { startTime: '08:00' },
            },
        ]);

        const res = await getHrdAttendanceTrend({
            from: '2026-07-06',
            to: '2026-07-06',
        });

        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(mocks.attendanceFindMany).toHaveBeenCalledTimes(1);
        expect(mocks.employeeFindMany).toHaveBeenCalledTimes(1);
        expect(mocks.appSettingFindMany).toHaveBeenCalledTimes(1);
        expect(res.data.shiftFiltered).toBe(false);
        expect(res.data.days[0]).toMatchObject({
            date: '2026-07-06',
            onTime: 1,
            late: 0,
            noRecord: 1,
            attendanceRate: 50,
        });
    });

    it('passes workShiftId, skips employee query, and sets rates to null when shift-filtered', async () => {
        mocks.attendanceFindMany.mockResolvedValue([
            {
                employeeId: 'e1',
                workDate: new Date('2026-07-06T00:00:00Z'),
                status: 'PRESENT',
                clockInAt: new Date('2026-07-06T01:20:00Z'),
                workShift: { startTime: '08:00' },
            },
        ]);

        const res = await getHrdAttendanceTrend({
            from: '2026-07-06',
            to: '2026-07-06',
            workShiftId: 'shift-1',
        });

        expect(res.success).toBe(true);
        if (!res.success) return;
        expect(mocks.employeeFindMany).not.toHaveBeenCalled();
        expect(mocks.attendanceFindMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ workShiftId: 'shift-1' }),
            }),
        );
        expect(res.data.shiftFiltered).toBe(true);
        expect(res.data.days[0]).toMatchObject({
            onTime: 0,
            late: 1,
            attendanceRate: null,
            noRecord: null,
        });
    });

    it('surfaces DB errors honestly', async () => {
        mocks.attendanceFindMany.mockRejectedValue(new Error('db down'));
        const res = await getHrdAttendanceTrend({
            from: '2026-07-06',
            to: '2026-07-06',
        });
        expect(res.success).toBe(false);
    });
});
