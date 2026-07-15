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

describe('AttendanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const activeEmployee = { id: 'emp-1', name: 'Budi', code: 'EMP-001', pinHash: 'hashed', status: 'ACTIVE' };
  const activeShift = { id: 'shift-1', name: 'Pagi-8', startTime: '06:00', endTime: '14:00', plannedHours: null, status: 'ACTIVE' };

  describe('clockIn', () => {
    it('clocks in successfully for first shift of the day', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null); // no open session
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null); // no duplicate
      vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(0); // first shift
      vi.mocked(mockDb.attendanceRecord.create).mockResolvedValue({
        id: 'rec-1', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
        workShiftId: 'shift-1', clockInAt: new Date(), clockOutAt: null,
        isOvertimeShift: false, status: 'PRESENT', source: 'KIOSK',
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.clockIn(mockDb as any, {
        employeeCode: 'EMP-001', pin: '1234', workShiftId: 'shift-1',
      });

      expect(result.employeeName).toBe('Budi');
      expect(result.isOvertimeShift).toBe(false);
      expect(mockDb.attendanceRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isOvertimeShift: false }),
        }),
      );
    });

    it('sets isOvertimeShift=true for 2nd shift of the day', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(true);
      vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null); // no open session
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null); // no duplicate
      vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(1); // already has 1 record
      vi.mocked(mockDb.attendanceRecord.create).mockResolvedValue({
        id: 'rec-2', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
        workShiftId: 'shift-2', clockInAt: new Date(), clockOutAt: null,
        isOvertimeShift: true, status: 'PRESENT', source: 'KIOSK',
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: { ...activeShift, id: 'shift-2', name: 'Siang-8' },
      } as any);

      const result = await AttendanceService.clockIn(mockDb as any, {
        employeeCode: 'EMP-001', pin: '1234', workShiftId: 'shift-2',
      });

      expect(result.isOvertimeShift).toBe(true);
    });

    it('rejects when employee not found', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(null);
      await expect(
        AttendanceService.clockIn(mockDb as any, {
          employeeCode: 'EMP-999', pin: '1234', workShiftId: 'shift-1',
        }),
      ).rejects.toThrow('Karyawan tidak ditemukan');
    });

    it('rejects when PIN is wrong', async () => {
      vi.mocked(mockDb.employee.findUnique).mockResolvedValue(activeEmployee as any);
      vi.mocked(verifyPin).mockResolvedValue(false);
      await expect(
        AttendanceService.clockIn(mockDb as any, {
          employeeCode: 'EMP-001', pin: '9999', workShiftId: 'shift-1',
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
      } as any);
      vi.mocked(mockDb.attendanceRecord.update).mockResolvedValue({
        id: 'rec-1', employeeId: 'emp-1', clockInAt: new Date('2026-07-15T06:00:00Z'),
        clockOutAt: new Date('2026-07-15T14:01:00Z'), isOvertimeShift: false,
        status: 'PRESENT', source: 'KIOSK',
        employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
      } as any);

      const result = await AttendanceService.clockOut(mockDb as any, {
        employeeCode: 'EMP-001', pin: '1234',
      });

      expect(result.clockOutAt).not.toBeNull();
      expect(result.actualHours).toBeGreaterThan(7);
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
          employee: { name: 'Budi', code: 'EMP-001' }, workShift: activeShift,
        },
        {
          id: 'rec-2', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
          workShiftId: 'shift-2', clockInAt: new Date('2026-07-15T14:00:00Z'),
          clockOutAt: new Date('2026-07-15T22:00:00Z'), isOvertimeShift: true,
          status: 'PRESENT', source: 'KIOSK',
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
      // verifyPin is NOT called — admin skips PIN
      vi.mocked(mockDb.workShift.findUnique).mockResolvedValue(activeShift as any);
      vi.mocked(mockDb.attendanceRecord.findFirst).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.findUnique).mockResolvedValue(null);
      vi.mocked(mockDb.attendanceRecord.count).mockResolvedValue(0);
      vi.mocked(mockDb.attendanceRecord.create).mockResolvedValue({
        id: 'rec-admin-1', employeeId: 'emp-1', workDate: new Date('2026-07-15'),
        workShiftId: 'shift-1', clockInAt: new Date(), clockOutAt: null,
        isOvertimeShift: false, status: 'PRESENT', source: 'MANUAL',
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
      } as any);
      vi.mocked(mockDb.attendanceRecord.update).mockResolvedValue({
        id: 'rec-1', employeeId: 'emp-1', clockInAt: new Date('2026-07-15T06:00:00Z'),
        clockOutAt: new Date('2026-07-15T14:01:00Z'), isOvertimeShift: false,
        status: 'PRESENT', source: 'MANUAL',
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
});
