import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttendanceService } from '../attendance-service';

// Mock prisma client
const mockDb = {
  employee: { findUnique: vi.fn() },
  workShift: { findUnique: vi.fn() },
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
      ).rejects.toThrow('Karyawan tidak ditemukan');
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
        status: 'PRESENT', source: 'KIOSK',
        dailyRateSnapshot: activeEmployee.dailyRate,
        overtimeRateSnapshot: activeEmployee.overtimeHourlyRate,
        standardDayHours: activeEmployee.standardDayHours,
        plannedHours: dec(8), actualHours: dec(8.02), regularHours: dec(8), overtimeHours: dec(0.02),
        dailyEarnings: dec(100000), overtimeEarnings: dec(3750), totalEarnings: dec(103750),
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.clockOut(mockDb as any, {
        employeeCode: 'EMP-001', pin: '1234',
      });

      expect(result.clockOutAt).not.toBeNull();
      expect(result.actualHours).toBeGreaterThan(7);
    });

    it('calculates partial day earnings proportionally', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
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
        clockOutAt: new Date('2026-07-15T09:00:00Z'), isOvertimeShift: false,
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
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);

      await expect(
        AttendanceService.clockOut(mockDb as any, {
          employeeCode: 'EMP-001', pin: '1234',
        }),
      ).rejects.toThrow('Tidak ada sesi absensi yang masih terbuka');
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
});
