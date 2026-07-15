import { PrismaClient, AttendanceSource, AttendanceStatus } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { verifyPin } from './pin-helpers';
import { resolveWorkDate, getEffectivePlannedHours, calcActualHours, calcOvertimeHours } from './shift-window';

// ─── Input types ───

export interface KioskClockInInput {
  employeeCode: string;
  pin: string;
  workShiftId: string;
  source?: AttendanceSource;
}

export interface KioskClockOutInput {
  employeeCode: string;
  pin: string;
}

/** Input for admin manual operations — no PIN required. */
export interface AdminClockInInput {
  employeeCode: string;
  workShiftId: string;
  source?: AttendanceSource;
}

export interface AdminClockOutInput {
  employeeCode: string;
}

export interface AttendanceRecordResult {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  workDate: Date;
  workShiftId: string;
  shiftName: string;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  isOvertimeShift: boolean;
  plannedHours: number;
  actualHours: number | null;
  overtimeHours: number;
  regularHours: number;
  status: AttendanceStatus;
  source: AttendanceSource;
}

export interface DailySummary {
  date: Date;
  totalEmployees: number;
  totalRecords: number;
  multiShiftCount: number;
  totalActualHours: number;
  totalOvertimeHours: number;
  records: AttendanceRecordResult[];
}

export interface ListFilters {
  workShiftId?: string;
  overtimeOnly?: boolean;
}

// ─── Helpers ───

type EmployeeSelect = { id: string; name: string; code: string; pinHash: string | null; status: string };
type ShiftSelect = { id: string; name: string; startTime: string; endTime: string; plannedHours: import('@prisma/client').Prisma.Decimal | null; status: string };
type RecordWithRelations = {
  id: string; employeeId: string; workDate: Date; workShiftId: string;
  clockInAt: Date | null; clockOutAt: Date | null; isOvertimeShift: boolean;
  status: AttendanceStatus; source: AttendanceSource;
  employee: { name: string; code: string };
  workShift: ShiftSelect;
};

async function findEmployee(db: PrismaClient, code: string): Promise<EmployeeSelect | null> {
  return db.employee.findUnique({ where: { code }, select: { id: true, name: true, code: true, pinHash: true, status: true } });
}

async function findShift(db: PrismaClient, shiftId: string): Promise<ShiftSelect | null> {
  return db.workShift.findUnique({ where: { id: shiftId }, select: { id: true, name: true, startTime: true, endTime: true, plannedHours: true, status: true } });
}

function buildRecordResult(record: RecordWithRelations): AttendanceRecordResult {
  const shift = record.workShift;
  const planned = getEffectivePlannedHours(shift.plannedHours != null ? Number(shift.plannedHours) : null, shift.startTime, shift.endTime);
  const actual = record.clockInAt && record.clockOutAt ? calcActualHours(record.clockInAt, record.clockOutAt) : null;
  const ot = actual !== null ? calcOvertimeHours(actual, planned) : 0;
  const reg = actual !== null ? Math.round(Math.min(actual, planned) * 100) / 100 : 0;

  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: record.employee.name,
    employeeCode: record.employee.code,
    workDate: record.workDate,
    workShiftId: record.workShiftId,
    shiftName: shift.name,
    clockInAt: record.clockInAt,
    clockOutAt: record.clockOutAt,
    isOvertimeShift: record.isOvertimeShift,
    plannedHours: planned,
    actualHours: actual,
    overtimeHours: ot,
    regularHours: reg,
    status: record.status,
    source: record.source,
  };
}

const includeRelations = {
  employee: { select: { name: true, code: true } },
  workShift: true,
} as const;

// ─── Core service ───

export const AttendanceService = {
  /**
   * Kiosk clock-in. Handles multi-shift overtime detection.
   */
  async clockIn(db: PrismaClient, input: KioskClockInInput): Promise<AttendanceRecordResult> {
    const employee = await findEmployee(db, input.employeeCode);
    if (!employee) throw new BusinessRuleError('Karyawan tidak ditemukan');
    if (employee.status !== 'ACTIVE') throw new BusinessRuleError('Karyawan tidak aktif');

    const pinValid = await verifyPin(input.pin, employee.pinHash);
    if (!pinValid) throw new BusinessRuleError('PIN salah');

    const shift = await findShift(db, input.workShiftId);
    if (!shift) throw new NotFoundError('Shift tidak ditemukan');
    if (shift.status !== 'ACTIVE') throw new BusinessRuleError('Shift tidak aktif');

    const now = new Date();
    const workDate = resolveWorkDate(now, shift.startTime, shift.endTime);

    // Check for open session (any shift, same date)
    const openSession = await db.attendanceRecord.findFirst({
      where: { employeeId: employee.id, workDate, clockInAt: { not: null }, clockOutAt: null },
    });
    if (openSession) {
      const openShift = await findShift(db, openSession.workShiftId);
      throw new BusinessRuleError(`Masih belum clock-out shift ${openShift?.name ?? ''}. Pulang dulu sebelum masuk shift berikutnya.`);
    }

    // Check duplicate shift
    const existing = await db.attendanceRecord.findUnique({
      where: { employeeId_workDate_workShiftId: { employeeId: employee.id, workDate, workShiftId: input.workShiftId } },
    });
    if (existing) throw new BusinessRuleError('Sudah absen shift ini hari ini');

    // Determine if overtime shift (2nd+ shift on same day)
    const sameDayCount = await db.attendanceRecord.count({
      where: { employeeId: employee.id, workDate, status: 'PRESENT' },
    });

    const record = await db.attendanceRecord.create({
      data: {
        employeeId: employee.id,
        workDate,
        workShiftId: input.workShiftId,
        clockInAt: now,
        isOvertimeShift: sameDayCount > 0,
        source: input.source ?? 'KIOSK',
        status: 'PRESENT',
      },
      include: includeRelations,
    });

    return buildRecordResult(record as RecordWithRelations);
  },

  /**
   * Kiosk clock-out.
   */
  async clockOut(db: PrismaClient, input: KioskClockOutInput): Promise<AttendanceRecordResult> {
    const employee = await findEmployee(db, input.employeeCode);
    if (!employee) throw new BusinessRuleError('Karyawan tidak ditemukan');
    if (employee.status !== 'ACTIVE') throw new BusinessRuleError('Karyawan tidak aktif');

    const pinValid = await verifyPin(input.pin, employee.pinHash);
    if (!pinValid) throw new BusinessRuleError('PIN salah');

    const openRecord = await db.attendanceRecord.findFirst({
      where: { employeeId: employee.id, clockInAt: { not: null }, clockOutAt: null },
      include: includeRelations,
      orderBy: { clockInAt: 'desc' },
    });
    if (!openRecord) throw new BusinessRuleError('Tidak ada sesi absensi yang masih terbuka');

    const now = new Date();
    const updated = await db.attendanceRecord.update({
      where: { id: openRecord.id },
      data: { clockOutAt: now },
      include: includeRelations,
    });

    return buildRecordResult(updated as RecordWithRelations);
  },

  /**
   * Admin manual clock-in — skips PIN verification.
   * Caller must verify authorization (requireAuth/requireRole).
   */
  async clockInAsAdmin(db: PrismaClient, input: AdminClockInInput): Promise<AttendanceRecordResult> {
    const employee = await findEmployee(db, input.employeeCode);
    if (!employee) throw new BusinessRuleError('Karyawan tidak ditemukan');
    if (employee.status !== 'ACTIVE') throw new BusinessRuleError('Karyawan tidak aktif');

    const shift = await findShift(db, input.workShiftId);
    if (!shift) throw new NotFoundError('Shift tidak ditemukan');
    if (shift.status !== 'ACTIVE') throw new BusinessRuleError('Shift tidak aktif');

    const now = new Date();
    const workDate = resolveWorkDate(now, shift.startTime, shift.endTime);

    const openSession = await db.attendanceRecord.findFirst({
      where: { employeeId: employee.id, workDate, clockInAt: { not: null }, clockOutAt: null },
    });
    if (openSession) {
      const openShift = await findShift(db, openSession.workShiftId);
      throw new BusinessRuleError(`Masih belum clock-out shift ${openShift?.name ?? ''}. Pulang dulu sebelum masuk shift berikutnya.`);
    }

    const existing = await db.attendanceRecord.findUnique({
      where: { employeeId_workDate_workShiftId: { employeeId: employee.id, workDate, workShiftId: input.workShiftId } },
    });
    if (existing) throw new BusinessRuleError('Sudah absen shift ini hari ini');

    const sameDayCount = await db.attendanceRecord.count({
      where: { employeeId: employee.id, workDate, status: 'PRESENT' },
    });

    const record = await db.attendanceRecord.create({
      data: {
        employeeId: employee.id,
        workDate,
        workShiftId: input.workShiftId,
        clockInAt: now,
        isOvertimeShift: sameDayCount > 0,
        source: input.source ?? 'MANUAL',
        status: 'PRESENT',
      },
      include: includeRelations,
    });

    return buildRecordResult(record as RecordWithRelations);
  },

  /**
   * Admin manual clock-out — skips PIN verification.
   * Caller must verify authorization (requireAuth/requireRole).
   */
  async clockOutAsAdmin(db: PrismaClient, input: AdminClockOutInput): Promise<AttendanceRecordResult> {
    const employee = await findEmployee(db, input.employeeCode);
    if (!employee) throw new BusinessRuleError('Karyawan tidak ditemukan');
    if (employee.status !== 'ACTIVE') throw new BusinessRuleError('Karyawan tidak aktif');

    const openRecord = await db.attendanceRecord.findFirst({
      where: { employeeId: employee.id, clockInAt: { not: null }, clockOutAt: null },
      include: includeRelations,
      orderBy: { clockInAt: 'desc' },
    });
    if (!openRecord) throw new BusinessRuleError('Tidak ada sesi absensi yang masih terbuka');

    const now = new Date();
    const updated = await db.attendanceRecord.update({
      where: { id: openRecord.id },
      data: { clockOutAt: now },
      include: includeRelations,
    });

    return buildRecordResult(updated as RecordWithRelations);
  },

  /**
   * List attendance records by date with optional filters.
   */
  async listByDate(db: PrismaClient, date: Date, filters?: ListFilters): Promise<AttendanceRecordResult[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = { workDate: date };
    if (filters?.workShiftId) where.workShiftId = filters.workShiftId;

    const records = await db.attendanceRecord.findMany({
      where,
      include: includeRelations,
      orderBy: [{ employee: { code: 'asc' } }, { clockInAt: 'asc' }],
    });

    let results = records.map(r => buildRecordResult(r as RecordWithRelations));

    if (filters?.overtimeOnly) {
      results = results.filter(r => r.isOvertimeShift || r.overtimeHours > 0);
    }

    return results;
  },

  /**
   * Get daily summary with aggregate metrics.
   */
  async getSummary(db: PrismaClient, date: Date): Promise<DailySummary> {
    const records = await db.attendanceRecord.findMany({
      where: { workDate: date, status: 'PRESENT' },
      include: includeRelations,
      orderBy: [{ employee: { code: 'asc' } }, { clockInAt: 'asc' }],
    });

    const results = records.map(r => buildRecordResult(r as RecordWithRelations));
    const uniqueEmployees = new Set(results.map(r => r.employeeId));
    const multiShiftEmployees = new Set(results.filter(r => r.isOvertimeShift).map(r => r.employeeId));

    return {
      date,
      totalEmployees: uniqueEmployees.size,
      totalRecords: results.length,
      multiShiftCount: multiShiftEmployees.size,
      totalActualHours: Math.round(results.reduce((sum, r) => sum + (r.actualHours ?? 0), 0) * 100) / 100,
      totalOvertimeHours: Math.round(results.reduce((sum, r) => sum + r.overtimeHours, 0) * 100) / 100,
      records: results,
    };
  },

  /**
   * Set employee attendance as ABSENT (manual only).
   */
  async setAbsent(db: PrismaClient, employeeId: string, workDate: Date, workShiftId: string, notes?: string): Promise<AttendanceRecordResult> {
    const existing = await db.attendanceRecord.findUnique({
      where: { employeeId_workDate_workShiftId: { employeeId, workDate, workShiftId } },
    });
    if (existing) throw new BusinessRuleError('Record sudah ada untuk shift ini');

    const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { name: true, code: true } });
    if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');

    const shift = await findShift(db, workShiftId);
    if (!shift) throw new NotFoundError('Shift tidak ditemukan');

    const record = await db.attendanceRecord.create({
      data: { employeeId, workDate, workShiftId, status: 'ABSENT', source: 'MANUAL', notes },
      include: includeRelations,
    });

    return buildRecordResult(record as RecordWithRelations);
  },

  /**
   * Correct an attendance record (admin edit).
   */
  async correct(db: PrismaClient, recordId: string, data: { clockInAt?: Date; clockOutAt?: Date; notes?: string }): Promise<AttendanceRecordResult> {
    const record = await db.attendanceRecord.findUnique({ where: { id: recordId }, include: includeRelations });
    if (!record) throw new NotFoundError('Record tidak ditemukan');

    const updated = await db.attendanceRecord.update({ where: { id: recordId }, data, include: includeRelations });
    return buildRecordResult(updated as RecordWithRelations);
  },
};
