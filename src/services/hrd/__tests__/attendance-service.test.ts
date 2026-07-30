import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttendanceService } from '../attendance-service';
import { haversineDistance } from '@/lib/utils/geo';

// Mock prisma client
const mockDb = {
  employee: { findUnique: vi.fn() },
  workShift: { findUnique: vi.fn() },
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

function todayMidnightUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function nowMinusHours(h: number) {
  return new Date(Date.now() - h * 3600_000);
}

function dec(n: number) {
  return { toNumber: () => n, valueOf: () => n } as any;
}

describe('AttendanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
  const activeShift = { id: 'shift-1', name: 'Pagi-8', startTime: '06:00', endTime: '14:00', plannedHours: null, status: 'ACTIVE' };

  describe('clockIn', () => {
    it('clocks in successfully for first shift of the day', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(0);
      vi.mocked(mockDb.attendanceRecord.create).mockResolvedValue({
        id: 'rec-1', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
        workShiftId: 'shift-1', clockInAt: new Date(), clockOutAt: null,
        isOvertimeShift: false, status: 'PRESENT', source: 'KIOSK',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
        clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg', clockOutPhotoUrl: null,
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.clockIn(mockDb as any, {
        employeeCode: 'EMP-001', pin: '1234', workShiftId: 'shift-1',
        clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
      });

      expect(result.employeeName).toBe('Budi');
      expect(result.isOvertimeShift).toBe(false);
      expect(mockDb.attendanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isOvertimeShift: false,
            clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
          }),
        }),
      );
    });

    it('sets isOvertimeShift=true for 2nd shift of the day', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(1);
      vi.mocked(mockDb.attendanceRecord.create).mockResolvedValue({
        id: 'rec-2', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
        workShiftId: 'shift-2', clockInAt: new Date(), clockOutAt: null,
        isOvertimeShift: true, status: 'PRESENT', source: 'KIOSK',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
        clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg', clockOutPhotoUrl: null,
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: { ...activeShift, id: 'shift-2', name: 'Siang-8' },
      } as any);

      const result = await AttendanceService.clockIn(mockDb as any, {
        employeeCode: 'EMP-001', pin: '1234', workShiftId: 'shift-2',
        clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
      });

      expect(result.isOvertimeShift).toBe(true);
    });

    it('rejects kiosk clock-in without selfie photo', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      await expect(
        AttendanceService.clockIn(mockDb as any, {
          employeeCode: 'EMP-001', pin: '1234', workShiftId: 'shift-1',
        }),
      ).rejects.toThrow('Data absensi tidak lengkap');
    });

    it('rejects kiosk clock-in with external photo URL', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      await expect(
        AttendanceService.clockIn(mockDb as any, {
          employeeCode: 'EMP-001', pin: '1234', workShiftId: 'shift-1',
          clockInPhotoUrl: 'https://evil.com/selfie.jpg',
        }),
      ).rejects.toThrow('Foto absensi tidak valid');
    });

    it('rejects when employee not found', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(null);
      await expect(
        AttendanceService.clockIn(mockDb as any, {
          employeeCode: 'EMP-999', pin: '1234', workShiftId: 'shift-1',
          clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
        }),
      ).rejects.toThrow(/tidak ditemukan/i);
    });

    it('rejects when PIN is wrong', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(false);
      await expect(
        AttendanceService.clockIn(mockDb as any, {
          employeeCode: 'EMP-001', pin: '9999', workShiftId: 'shift-1',
          clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
        }),
      ).rejects.toThrow('PIN salah');
    });

    it('rejects when there is an open session', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue({
        id: 'open-1', workShiftId: 'shift-1',
      } as any);

      await expect(
        AttendanceService.clockIn(mockDb as any, {
          employeeCode: 'EMP-001', pin: '1234', workShiftId: 'shift-2',
          clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
        }),
      ).rejects.toThrow('Masih belum clock-out');
    });

    it('rejects when same shift already clocked in today', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue({ id: 'dup' } as any);

      await expect(
        AttendanceService.clockIn(mockDb as any, {
          employeeCode: 'EMP-001', pin: '1234', workShiftId: 'shift-1',
          clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
        }),
      ).rejects.toThrow('Sudah absen shift ini hari ini');
    });
  });

  describe('clockOut', () => {
    it('clocks out successfully', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      const recentClockIn = nowMinusHours(2);
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
        {
          id: 'rec-1', employeeId: 'emp-1', workDate: todayMidnightUTC(),
          clockInAt: recentClockIn, clockOutAt: null, workShift: activeShift, workShiftId: 'shift-1',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        },
      ] as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.update).mockResolvedValue({
        id: 'rec-1', employeeId: 'emp-1', clockInAt: recentClockIn,
        clockOutAt: new Date(), isOvertimeShift: false,
        status: 'PRESENT', source: 'KIOSK',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        plannedHours: dec(8), actualHours: dec(2), regularHours: dec(2), overtimeHours: dec(0),
        dailyEarnings: dec(25000), overtimeEarnings: dec(0), totalEarnings: dec(25000),
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.clockOut(mockDb as any, {
        employeeCode: 'EMP-001', pin: '1234',
      });

      expect(result.clockOutAt).not.toBeNull();
    });

    it('calculates partial day earnings proportionally', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      const recentClockIn = nowMinusHours(3);
      const recentClockOut = new Date();
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
        {
          id: 'rec-1', employeeId: 'emp-1', workDate: todayMidnightUTC(),
          clockInAt: recentClockIn, clockOutAt: null, workShift: activeShift, workShiftId: 'shift-1',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        },
      ] as any);
      vi.mocked(mockDb.attendanceRecord.update).mockResolvedValue({
        id: 'rec-1', employeeId: 'emp-1', clockInAt: recentClockIn,
        clockOutAt: recentClockOut, isOvertimeShift: false,
        status: 'PRESENT', source: 'KIOSK',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        plannedHours: dec(8), actualHours: dec(3), regularHours: dec(3), overtimeHours: dec(0),
        dailyEarnings: dec(37500), overtimeEarnings: dec(0), totalEarnings: dec(37500),
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.clockOut(mockDb as any, {
        employeeCode: 'EMP-001', pin: '1234',
      });

      expect(result.dailyEarnings).toBe(37500);
      expect(result.totalEarnings).toBe(37500);
    });

    it('rejects when no open session', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([]);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);

      await expect(
        AttendanceService.clockOut(mockDb as any, {
          employeeCode: 'EMP-001', pin: '1234',
        }),
      ).rejects.toThrow('Tidak ada sesi absensi yang masih terbuka');
    });

    it('rejects stale session with HRD correction message', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      // 22 Juli stale record, clock-in 5 days ago
      const staleDate = new Date('2026-07-22T00:00:00.000Z');
      const staleClockIn = new Date(Date.now() - 5 * 24 * 3600_000);
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
        {
          id: 'rec-stale', employeeId: 'emp-1', workDate: staleDate,
          clockInAt: staleClockIn, clockOutAt: null, workShift: activeShift, workShiftId: 'shift-1',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        },
      ] as any);

      await expect(
        AttendanceService.clockOut(mockDb as any, {
          employeeCode: 'EMP-001', pin: '1234',
        }),
      ).rejects.toThrow(/koreksi HRD/i);
    });

    it('uses findMany resolver and closes newest today record when both today and stale exist', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      const staleDate = new Date('2026-07-22T00:00:00.000Z');
      const staleClockIn = new Date(Date.now() - 5 * 24 * 3600_000);
      const todayClockIn = nowMinusHours(1);
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
        {
          id: 'rec-today', employeeId: 'emp-1', workDate: todayMidnightUTC(),
          clockInAt: todayClockIn, clockOutAt: null, workShift: activeShift, workShiftId: 'shift-1',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        },
        {
          id: 'rec-stale', employeeId: 'emp-1', workDate: staleDate,
          clockInAt: staleClockIn, clockOutAt: null, workShift: activeShift, workShiftId: 'shift-1',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        },
      ] as any);
      vi.mocked(mockDb.attendanceRecord.update).mockResolvedValue({
        id: 'rec-today', employeeId: 'emp-1', clockInAt: todayClockIn,
        clockOutAt: new Date(), isOvertimeShift: false,
        status: 'PRESENT', source: 'KIOSK',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        plannedHours: dec(8), actualHours: dec(1), regularHours: dec(1), overtimeHours: dec(0),
        dailyEarnings: dec(12500), overtimeEarnings: dec(0), totalEarnings: dec(12500),
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.clockOut(mockDb as any, {
        employeeCode: 'EMP-001', pin: '1234',
      });
      expect(result.id).toBe('rec-today');
    });
  });

  describe('listByDate', () => {
    it('returns records for a date', async () => {
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
        {
          id: 'rec-1', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
          workShiftId: 'shift-1', clockInAt: new Date('2026-07-15T06:00:00Z'),
          clockOutAt: new Date('2026-07-15T14:00:00Z'), isOvertimeShift: false,
          status: 'PRESENT', source: 'KIOSK',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: dec(8), regularHours: dec(8), overtimeHours: dec(0),
          dailyEarnings: dec(100000), overtimeEarnings: dec(0), totalEarnings: dec(100000),
          employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
        },
      ] as any);

      const results = await AttendanceService.listByDate(mockDb as any, new Date('2026-07-15'));
      expect(results).toHaveLength(1);
      expect(results[0].actualHours).toBe(8);
      expect(results[0].overtimeHours).toBe(0);
    });

    it('filters overtime only', async () => {
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
        {
          id: 'rec-1', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
          workShiftId: 'shift-1', clockInAt: new Date('2026-07-15T06:00:00Z'),
          clockOutAt: new Date('2026-07-15T14:00:00Z'), isOvertimeShift: false,
          status: 'PRESENT', source: 'KIOSK',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: dec(8), regularHours: dec(8), overtimeHours: dec(0),
          dailyEarnings: dec(100000), overtimeEarnings: dec(0), totalEarnings: dec(100000),
          employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
        },
        {
          id: 'rec-2', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
          workShiftId: 'shift-2', clockInAt: new Date('2026-07-15T14:00:00Z'),
          clockOutAt: new Date('2026-07-15T22:00:00Z'), isOvertimeShift: true,
          status: 'PRESENT', source: 'KIOSK',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: dec(8), regularHours: dec(8), overtimeHours: dec(0),
          dailyEarnings: dec(100000), overtimeEarnings: dec(0), totalEarnings: dec(100000),
          employee: { name: 'Budi', code: 'EMP-001' }, workShift: { ...activeShift, name: 'Siang-8' },
        },
      ] as any);

      const results = await AttendanceService.listByDate(mockDb as any, new Date('2026-07-15'), { overtimeOnly: true });
      expect(results).toHaveLength(1);
      expect(results[0].isOvertimeShift).toBe(true);
    });
  });

  describe('setAbsent', () => {
    it('creates ABSENT record', async () => {
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null);
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
      vi.mocked(mockDb.attendanceRecord.create).mockResolvedValue({
        id: 'abs-1', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
        workShiftId: 'shift-1', clockInAt: null, clockOutAt: null,
        isOvertimeShift: false, status: 'ABSENT', source: 'MANUAL',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
        dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.setAbsent(mockDb as any, 'emp-1', new Date('2026-07-15'), 'shift-1');
      expect(result.status).toBe('ABSENT');
    });

    it('rejects if record already exists', async () => {
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue({ id: 'existing' } as any);
      await expect(
        AttendanceService.setAbsent(mockDb as any, 'emp-1', new Date('2026-07-15'), 'shift-1'),
      ).rejects.toThrow('Record sudah ada');
    });
  });

  describe('clockInAsAdmin', () => {
    it('clocks in without PIN verification', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(0);
      vi.mocked(mockDb.attendanceRecord.create).mockResolvedValue({
        id: 'rec-admin-1', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
        workShiftId: 'shift-1', clockInAt: new Date(), clockOutAt: null,
        isOvertimeShift: false, status: 'PRESENT', source: 'MANUAL',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.clockInAsAdmin(mockDb as any, {
        employeeCode: 'EMP-001', workShiftId: 'shift-1',
      });

      expect(result.employeeName).toBe('Budi');
      expect(result.source).toBe('MANUAL');
      expect(verifyPin).not.toHaveBeenCalled();
    });

    it('works for employee without pinHash', async () => {
      const noPinEmployee = { ...activeEmployee, pinHash: null };
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(noPinEmployee as any);
      vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(0);
      vi.mocked(mockDb.attendanceRecord.create).mockResolvedValue({
        id: 'rec-admin-2', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
        workShiftId: 'shift-1', clockInAt: new Date(), clockOutAt: null,
        isOvertimeShift: false, status: 'PRESENT', source: 'MANUAL',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.clockInAsAdmin(mockDb as any, {
        employeeCode: 'EMP-001', workShiftId: 'shift-1',
      });

      expect(result.employeeName).toBe('Budi');
      expect(verifyPin).not.toHaveBeenCalled();
    });

    it('still rejects inactive employee', async () => {
      const inactiveEmployee = { ...activeEmployee, status: 'INACTIVE' };
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(inactiveEmployee as any);
      await expect(
        AttendanceService.clockInAsAdmin(mockDb as any, {
          employeeCode: 'EMP-001', workShiftId: 'shift-1',
        }),
      ).rejects.toThrow('Karyawan tidak aktif');
    });
  });

  describe('clockOutAsAdmin', () => {
    it('clocks out without PIN verification', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue({
        id: 'rec-1', employeeId: 'emp-1', clockInAt: new Date('2026-07-15T06:00:00Z'),
        clockOutAt: null, workShift: activeShift,
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
        dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
      } as any);
      vi.mocked(mockDb.attendanceRecord.update).mockResolvedValue({
        id: 'rec-1', employeeId: 'emp-1', clockInAt: new Date('2026-07-15T06:00:00Z'),
        clockOutAt: new Date('2026-07-15T14:01:00Z'), isOvertimeShift: false,
        status: 'PRESENT', source: 'MANUAL',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        plannedHours: dec(8), actualHours: dec(8.02), regularHours: dec(8), overtimeHours: dec(0.02),
        dailyEarnings: dec(100000), overtimeEarnings: dec(3750), totalEarnings: dec(103750),
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.clockOutAsAdmin(mockDb as any, {
        employeeCode: 'EMP-001',
      });

      expect(result.clockOutAt).not.toBeNull();
      expect(verifyPin).not.toHaveBeenCalled();
    });

    it('rejects when no open session', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);

      await expect(
        AttendanceService.clockOutAsAdmin(mockDb as any, {
          employeeCode: 'EMP-001',
        }),
      ).rejects.toThrow('Tidak ada sesi absensi yang masih terbuka');
    });
  });

  // ─── Fase 3 ───
  describe('listByRange', () => {
    it('queries records by workDate range', async () => {
      const findMany = vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([] as any);
      await AttendanceService.listByRange(mockDb as any, new Date('2026-07-13'), new Date('2026-07-19'));
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          workDate: { gte: new Date('2026-07-13'), lte: new Date('2026-07-19') },
        }),
        include: expect.any(Object),
        orderBy: expect.any(Array),
      }));
    });
  });

  describe('getWeeklySummary', () => {
    it('aggregates per employee', async () => {
      const rec = (id: string, empId: string, empCode: string, empName: string, actualH: number, otH: number) => ({
        id, employeeId: empId, workDate: new Date('2026-07-15'),
        workShiftId: 'shift-1', clockInAt: new Date('2026-07-15T06:00:00Z'),
        clockOutAt: new Date('2026-07-15T06:00:00Z'), // 0 hours; but we'll override computed fields below
        isOvertimeShift: false, status: 'PRESENT', source: 'KIOSK',
        dailyRateSnapshot: dec(0), overtimeRateSnapshot: dec(0),
        standardDayHours: dec(8),
        plannedHours: dec(8), actualHours: dec(actualH), regularHours: dec(actualH), overtimeHours: dec(otH),
        dailyEarnings: dec(actualH * 12500), overtimeEarnings: dec(otH * 18750),
        totalEarnings: dec(actualH * 12500 + otH * 18750),
        employee: { name: empName, code: empCode }, workShift: activeShift,
      });
      // Set explicit clockOutAt to produce actual hours; better — set actual directly:
      const makeRec = (id: string, empId: string, empCode: string, empName: string, actualH: number, otH: number) => {
        const r = rec(id, empId, empCode, empName, actualH, otH);
        // Make actualHours computed: actual = regular + OT.
        const start = new Date('2026-07-15T06:00:00Z');
        const end = new Date(start.getTime() + (actualH + otH) * 3600_000);
        r.clockInAt = start; r.clockOutAt = end;
        // Set snapshots so computeEarnings produces the expected dailyEarnings & OT earnings.
        // dailyRate=100000/8h → regular(8h)=100000; OT rate=18750/2h=37500.
        r.dailyRateSnapshot = dec(100000);
        r.overtimeRateSnapshot = dec(18750);
        // plannedHours=8 → regular=10h when actual=10 → computeEarnings sets regular=8, OT=2
        return r;
      };

      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
        makeRec('r1', 'emp-1', 'EMP-001', 'Budi', 8, 2),
        makeRec('r2', 'emp-1', 'EMP-001', 'Budi', 8, 0),
        makeRec('r3', 'emp-2', 'EMP-002', 'Sari', 6, 0),
      ] as any);

      const summary = await AttendanceService.getWeeklySummary(mockDb as any, new Date('2026-07-13'), new Date('2026-07-19'));
      expect(summary).toHaveLength(2);
      const budi = summary.find(s => s.employeeId === 'emp-1')!;
      expect(budi.daysPresent).toBe(2);
      expect(budi.totalActualHours).toBe(18); // 10 + 8 (actual = regular + OT)
      expect(budi.totalOvertimeHours).toBe(2);
      expect(budi.totalDailyEarnings).toBe(200000); // 100000 computed daily for each (regular=8, dailyRate=100000)
      expect(budi.totalOvertimeEarnings).toBe(37500);
      expect(budi.totalEarnings).toBe(237500);
    });
  });

  // ─── Gelombang A1 ───
  describe('getMonthlySummary', () => {
    it('counts PRESENT/ABSENT/ON_LEAVE and multi-shift days per employee', async () => {
      const records = [
        // emp-1: 2 PRESENT days (Jul 15 + Jul 16), 1 ABSENT (Jul 17), multi-shift on Jul 15 (2 records)
        { employeeId: 'emp-1', workDate: new Date('2026-07-15'), status: 'PRESENT', actualHours: dec(8), overtimeHours: dec(2), employee: { name: 'Budi', code: 'EMP-001' } },
        { employeeId: 'emp-1', workDate: new Date('2026-07-15'), status: 'PRESENT', actualHours: dec(4), overtimeHours: dec(0), employee: { name: 'Budi', code: 'EMP-001' } },
        { employeeId: 'emp-1', workDate: new Date('2026-07-16'), status: 'PRESENT', actualHours: dec(8), overtimeHours: dec(0), employee: { name: 'Budi', code: 'EMP-001' } },
        { employeeId: 'emp-1', workDate: new Date('2026-07-17'), status: 'ABSENT', actualHours: null, overtimeHours: null, employee: { name: 'Budi', code: 'EMP-001' } },
        // emp-2: 1 ON_LEAVE
        { employeeId: 'emp-2', workDate: new Date('2026-07-15'), status: 'ON_LEAVE', actualHours: null, overtimeHours: null, employee: { name: 'Sari', code: 'EMP-002' } },
      ];
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue(records as any);

      const summary = await AttendanceService.getMonthlySummary(mockDb as any, 2026, 7);
      expect(summary).toHaveLength(2);

      const budi = summary.find(s => s.employeeId === 'emp-1')!;
      expect(budi.daysPresent).toBe(2); // 2 unique PRESENT dates (Jul 15 + Jul 16)
      expect(budi.daysAbsent).toBe(1);
      expect(budi.daysOnLeave).toBe(0);
      expect(budi.totalActualHours).toBe(20); // 8+4+8
      expect(budi.totalOvertimeHours).toBe(2);
      expect(budi.multiShiftDays).toBe(1); // Jul 15 has 2 records

      const sari = summary.find(s => s.employeeId === 'emp-2')!;
      expect(sari.daysOnLeave).toBe(1);
      expect(sari.daysPresent).toBe(0);
    });

    it('returns empty array for month with no records', async () => {
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([]);
      const summary = await AttendanceService.getMonthlySummary(mockDb as any, 2026, 12);
      expect(summary).toEqual([]);
    });
  });

  describe('getMyTodayStatus - stale handling', () => {
    it('returns OPEN_STALE when only stale open session exists', async () => {
      vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockResolvedValue({
        workShift: activeShift,
      } as any);
      const staleDate = new Date('2026-07-22T00:00:00.000Z');
      const staleClockIn = new Date(Date.now() - 5 * 24 * 3600_000);
      const rec = {
        id: 'rec-stale', employeeId: 'emp-1', workDate: staleDate,
        clockInAt: staleClockIn, clockOutAt: null, workShift: activeShift, workShiftId: 'shift-1',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
        dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        employee: { name: 'Budi', code: 'EMP-001' },
      };
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([rec] as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null); // todayRecord none

      const status = await AttendanceService.getMyTodayStatus(mockDb as any, 'emp-1');
      expect(status.status).toBe('OPEN_STALE');
      expect(status.staleDate).toMatch(/2026-07-22/);
    });

    it('returns WORKING when today open session exists even with stale present', async () => {
      vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockResolvedValue({
        workShift: activeShift,
      } as any);
      const staleDate = new Date('2026-07-22T00:00:00.000Z');
      const staleClockIn = new Date(Date.now() - 5 * 24 * 3600_000);
      const todayClockIn = nowMinusHours(1);
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
        {
          id: 'rec-today', employeeId: 'emp-1', workDate: todayMidnightUTC(),
          clockInAt: todayClockIn, clockOutAt: null, workShift: activeShift, workShiftId: 'shift-1',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
          employee: { name: 'Budi', code: 'EMP-001' },
        },
        {
          id: 'rec-stale', employeeId: 'emp-1', workDate: staleDate,
          clockInAt: staleClockIn, clockOutAt: null, workShift: activeShift, workShiftId: 'shift-1',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
          employee: { name: 'Budi', code: 'EMP-001' },
        },
      ] as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);

      const status = await AttendanceService.getMyTodayStatus(mockDb as any, 'emp-1');
      expect(status.status).toBe('WORKING');
      expect(status.record?.id).toBe('rec-today');
    });

    it('does not treat an old completed record from another day as CLOCKED_OUT today', async () => {
      // Regression test: the completed-record lookup must filter by
      // workDate, otherwise Prisma's orderBy: { clockOutAt: 'desc' } returns
      // the most recently ever completed record — permanently reporting
      // CLOCKED_OUT (and hiding the clock-in button) after an employee's
      // very first successful cycle, with no visible error anywhere.
      vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockResolvedValue({
        workShift: activeShift,
      } as any);
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([]); // no open records
      // Simulate a correctly-filtered DB: no record matches today's workDate.
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);

      const status = await AttendanceService.getMyTodayStatus(mockDb as any, 'emp-1');

      expect(status.status).toBe('NOT_CLOCKED_IN');
      // The query must scope completed records to today's workDate so a
      // record from days ago can never satisfy it.
      expect(mockDb.attendanceRecord.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employeeId: 'emp-1',
            workDate: expect.any(Date),
            clockInAt: { not: null },
            clockOutAt: { not: null },
          }),
        }),
      );
    });
  });

  describe('clockInSelfService - missing assignment', () => {
    it('rejects when no active shift assignment', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockResolvedValue(null);

      await expect(
        AttendanceService.clockInSelfService(mockDb as any, {
          employeeId: 'emp-1',
          clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
          locationEvidence: { latitude: -6, longitude: 106, accuracy: 10 },
        }, { 'attendance.selfServiceEnabled': 'true', 'attendance.geofenceEnabled': 'false' }),
      ).rejects.toThrow(/HRD belum menetapkan shift/);
    });
  });

  describe('clockOutSelfService - stale guard', () => {
    it('rejects stale session instead of closing wrong record', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue({ id: 'emp-1', name: 'Budi', code: 'EMP-001', status: 'ACTIVE' } as any);
      const staleDate = new Date('2026-07-22T00:00:00.000Z');
      const staleClockIn = new Date(Date.now() - 5 * 24 * 3600_000);
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
        {
          id: 'rec-stale', employeeId: 'emp-1', workDate: staleDate,
          clockInAt: staleClockIn, clockOutAt: null, workShift: activeShift, workShiftId: 'shift-1',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
          employee: { name: 'Budi', code: 'EMP-001' },
        },
      ] as any);

      await expect(
        AttendanceService.clockOutSelfService(mockDb as any, {
          employeeId: 'emp-1',
          locationEvidence: { latitude: -6, longitude: 106, accuracy: 10 },
        }, { 'attendance.geofenceEnabled': 'false' }),
      ).rejects.toThrow(/koreksi HRD/i);
    });
  });

  // ─── Fase 1 — fail-closed geofence hardening ───
  describe('clockInSelfService - fail-closed geofence', () => {
    it('THROWS when geofenceEnabled=true but latitude is empty (fail-open regression guard)', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);

      await expect(
        AttendanceService.clockInSelfService(mockDb as any, {
          employeeId: 'emp-1',
          clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
          locationEvidence: { latitude: -6, longitude: 106, accuracy: 10 },
        }, {
          'attendance.geofenceEnabled': 'true',
          'attendance.latitude': '',
          'attendance.longitude': '106.0',
          'attendance.radiusMeters': '100',
          'attendance.maxAccuracyMeters': '50',
        }),
      ).rejects.toThrow(/Konfigurasi geofence belum lengkap/);
    });

    it('THROWS when geofenceEnabled=true but latitude is invalid string', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);

      await expect(
        AttendanceService.clockInSelfService(mockDb as any, {
          employeeId: 'emp-1',
          clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
          locationEvidence: { latitude: -6, longitude: 106, accuracy: 10 },
        }, {
          'attendance.geofenceEnabled': 'true',
          'attendance.latitude': 'invalid',
          'attendance.longitude': '106.0',
          'attendance.radiusMeters': '100',
          'attendance.maxAccuracyMeters': '50',
        }),
      ).rejects.toThrow(/Konfigurasi geofence belum lengkap/);
    });
  });

  describe('clockOutSelfService - fail-closed geofence', () => {
    it('THROWS when geofenceEnabled=true but latitude is empty', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue({
        id: 'emp-1', name: 'Budi', code: 'EMP-001', status: 'ACTIVE',
      } as any);

      await expect(
        AttendanceService.clockOutSelfService(mockDb as any, {
          employeeId: 'emp-1',
          locationEvidence: { latitude: -6, longitude: 106, accuracy: 10 },
        }, {
          'attendance.geofenceEnabled': 'true',
          'attendance.latitude': '',
          'attendance.longitude': '106.0',
          'attendance.radiusMeters': '100',
          'attendance.maxAccuracyMeters': '50',
        }),
      ).rejects.toThrow(/Konfigurasi geofence belum lengkap/);
    });
  });

  describe('clockInSelfService - disabled geofence still stores location, distance null', () => {
    it('succeeds when geofence disabled, stores lat/lon, distance is null', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockResolvedValue({
        workShiftId: 'shift-1',
        workShift: activeShift,
      } as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(0);

      let capturedData: any = null;
      vi.mocked(mockDb.attendanceRecord.create).mockImplementation(async (arg: any) => {
        capturedData = arg.data;
        return {
          id: 'rec-new', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
          workShiftId: 'shift-1', clockInAt: new Date(), clockOutAt: null,
          isOvertimeShift: false, status: 'PRESENT', source: 'SELF_SERVICE',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
          plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
          clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg', clockOutPhotoUrl: null,
          clockInLatitude: capturedData.clockInLatitude,
          clockInLongitude: capturedData.clockInLongitude,
          clockInAccuracy: capturedData.clockInAccuracy,
          clockInDistance: capturedData.clockInDistance,
          employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
        } as any;
      });

      const result = await AttendanceService.clockInSelfService(mockDb as any, {
        employeeId: 'emp-1',
        clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
        locationEvidence: { latitude: -6.12, longitude: 106.12, accuracy: 10 },
      }, { 'attendance.geofenceEnabled': 'false' });

      expect(result.employeeName).toBe('Budi');
      // Location must still be persisted (Step 5a)
      expect(capturedData.clockInLatitude).not.toBeNull();
      expect(capturedData.clockInLongitude).not.toBeNull();
      expect(capturedData.clockInAccuracy).not.toBeNull();
      // Distance must be null when disabled (Step 5b)
      expect(capturedData.clockInDistance).toBeNull();
    });
  });

  // ─── Fase 1 review round — Step 5c distance reuse + accuracy guard ───

  /** Arms the clock-in happy path and returns a getter for the captured create() data. */
  function armClockInCapture() {
    vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
    vi.mocked(mockDb.employeeShiftAssignment.findFirst).mockResolvedValue({
      workShiftId: 'shift-1',
      workShift: activeShift,
    } as any);
    vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);
    vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null);
    vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(0);

    const captured: { data: any } = { data: null };
    vi.mocked(mockDb.attendanceRecord.create).mockImplementation(async (arg: any) => {
      captured.data = arg.data;
      return {
        id: 'rec-new', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
        workShiftId: 'shift-1', clockInAt: new Date(), clockOutAt: null,
        isOvertimeShift: false, status: 'PRESENT', source: 'SELF_SERVICE',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
        plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
        clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg', clockOutPhotoUrl: null,
        clockInLatitude: arg.data.clockInLatitude,
        clockInLongitude: arg.data.clockInLongitude,
        clockInAccuracy: arg.data.clockInAccuracy,
        clockInDistance: arg.data.clockInDistance,
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any;
    });
    return captured;
  }

  describe('clockInSelfService - distance persisted from validateLocation (Step 5c)', () => {
    it('stores the real haversine distance when inside an active geofence', async () => {
      const captured = armClockInCapture();

      // Office and employee ~50 m apart, well inside a 500 m fence.
      const officeLat = -6.2;
      const officeLon = 106.8;
      const empLat = -6.2004;
      const empLon = 106.8002;

      await AttendanceService.clockInSelfService(mockDb as any, {
        employeeId: 'emp-1',
        clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
        locationEvidence: { latitude: empLat, longitude: empLon, accuracy: 10 },
      }, {
        'attendance.geofenceEnabled': 'true',
        'attendance.latitude': String(officeLat),
        'attendance.longitude': String(officeLon),
        'attendance.radiusMeters': '500',
        'attendance.maxAccuracyMeters': '50',
      });

      // Must equal the genuine haversine distance — asserting "not null" alone
      // would still pass if the wrong field were reused.
      const expected = haversineDistance(officeLat, officeLon, empLat, empLon);
      expect(captured.data.clockInDistance).not.toBeNull();
      expect(Number(captured.data.clockInDistance)).toBeCloseTo(expected, 1);
    });
  });

  describe('clockInSelfService - non-finite accuracy is dropped, not written', () => {
    it('stores no location at all when accuracy is NaN', async () => {
      const captured = armClockInCapture();

      const result = await AttendanceService.clockInSelfService(mockDb as any, {
        employeeId: 'emp-1',
        clockInPhotoUrl: '/api/images/test/attendance/emp-1/clock_in-1.jpg',
        locationEvidence: { latitude: -6.12, longitude: 106.12, accuracy: NaN },
      }, { 'attendance.geofenceEnabled': 'false' });

      // Attendance still succeeds — bad accuracy must not block clocking in.
      expect(result.employeeName).toBe('Budi');
      // But no NaN may reach a Decimal column.
      expect(captured.data.clockInLatitude).toBeNull();
      expect(captured.data.clockInLongitude).toBeNull();
      expect(captured.data.clockInAccuracy).toBeNull();
    });
  });

  describe('clockOutSelfService - disabled geofence still stores location', () => {
    it('stores lat/lon/accuracy with distance null', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue({
        id: 'emp-1', name: 'Budi', code: 'EMP-001', status: 'ACTIVE',
      } as any);
      vi.mocked(mockDb.attendanceRecord.findMany).mockResolvedValue([
        {
          id: 'rec-open', employeeId: 'emp-1', workDate: todayMidnightUTC(),
          clockInAt: nowMinusHours(3), clockOutAt: null,
          workShift: activeShift, workShiftId: 'shift-1',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          plannedHours: dec(8), actualHours: null, regularHours: dec(0), overtimeHours: dec(0),
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
          employee: { name: 'Budi', code: 'EMP-001' },
        },
      ] as any);

      // clockOut issues TWO updates: the geo/clock-out write, then a second
      // one carrying only computed hours. Keep the first — the last would not
      // contain the location fields at all.
      const updateCalls: any[] = [];
      vi.mocked(mockDb.attendanceRecord.update).mockImplementation(async (arg: any) => {
        updateCalls.push(arg.data);
        return {
          id: 'rec-open', employeeId: 'emp-1', workDate: todayMidnightUTC(),
          workShiftId: 'shift-1', clockInAt: nowMinusHours(3), clockOutAt: new Date(),
          isOvertimeShift: false, status: 'PRESENT', source: 'SELF_SERVICE',
          dailyRateSnapshot: activeEmployee.dailyRate,
          overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
          standardDayHours: activeEmployee.standardDayHours,
          dailyEarnings: dec(0), overtimeEarnings: dec(0), totalEarnings: dec(0),
          plannedHours: dec(8), actualHours: dec(3), regularHours: dec(3), overtimeHours: dec(0),
          clockInPhotoUrl: null, clockOutPhotoUrl: null,
          clockOutLatitude: arg.data.clockOutLatitude,
          clockOutLongitude: arg.data.clockOutLongitude,
          clockOutAccuracy: arg.data.clockOutAccuracy,
          clockOutDistance: arg.data.clockOutDistance,
          employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
        } as any;
      });

      await AttendanceService.clockOutSelfService(mockDb as any, {
        employeeId: 'emp-1',
        locationEvidence: { latitude: -6.12, longitude: 106.12, accuracy: 12 },
      }, { 'attendance.geofenceEnabled': 'false' });

      const geoWrite = updateCalls[0];
      // Assert real values, not merely "not null" — undefined would satisfy
      // not.toBeNull() and let a missing field pass silently.
      expect(Number(geoWrite.clockOutLatitude)).toBeCloseTo(-6.12, 5);
      expect(Number(geoWrite.clockOutLongitude)).toBeCloseTo(106.12, 5);
      expect(Number(geoWrite.clockOutAccuracy)).toBeCloseTo(12, 2);
      expect(geoWrite.clockOutDistance).toBeNull();
    });
  });
});
