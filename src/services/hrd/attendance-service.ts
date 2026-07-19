import { PrismaClient, AttendanceSource, AttendanceStatus } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { verifyPin } from './pin-helpers';
import { resolveWorkDate, getEffectivePlannedHours, calcActualHours, calcOvertimeHours } from './shift-window';
import { Prisma } from '@prisma/client';
import { isValidAttendancePhotoUrl } from '@/lib/media/attendance-photo-url';

// ─── Input types ───

export interface KioskClockInInput {
  employeeCode: string;
  pin: string;
  workShiftId: string;
  /** Required when source is KIOSK (default). */
  clockInPhotoUrl?: string;
  source?: AttendanceSource;
}

export interface KioskClockOutInput {
  employeeCode: string;
  pin: string;
  /** Optional evidence photo on clock-out. */
  clockOutPhotoUrl?: string;
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
  dailyRateSnapshot: number;
  overtimeRateSnapshot: number;
  dailyEarnings: number;
  overtimeEarnings: number;
  totalEarnings: number;
  clockInPhotoUrl: string | null;
  clockOutPhotoUrl: string | null;
}

export interface DailySummary {
  date: Date;
  totalEmployees: number;
  totalRecords: number;
  multiShiftCount: number;
  totalActualHours: number;
  totalOvertimeHours: number;
  totalDailyEarnings: number;
  totalOvertimeEarnings: number;
  totalEarnings: number;
  records: AttendanceRecordResult[];
}

// Fase 3 — per-employee aggregate for weekly recap.
export interface WeeklyEmployeeSummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  daysPresent: number;
  totalActualHours: number;
  totalOvertimeHours: number;
  totalDailyEarnings: number;
  totalOvertimeEarnings: number;
  totalEarnings: number;
}

// Gelombang A1 — per-employee aggregate for monthly recap.
export interface MonthlyEmployeeSummary {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  daysPresent: number;
  daysAbsent: number;
  daysOnLeave: number;
  totalActualHours: number;
  totalOvertimeHours: number;
  multiShiftDays: number;
}

export interface ListFilters {
  workShiftId?: string;
  overtimeOnly?: boolean;
}

// ─── Helpers ───

type EmployeeSelect = { id: string; name: string; code: string; pinHash: string | null; status: string; payType: string; dailyRate: Prisma.Decimal; overtimeHourlyRate: Prisma.Decimal | null; standardDayHours: Prisma.Decimal };
type ShiftSelect = { id: string; name: string; startTime: string; endTime: string; plannedHours: Prisma.Decimal | null; status: string };
type RecordWithRelations = {
  id: string; employeeId: string; workDate: Date; workShiftId: string;
  clockInAt: Date | null; clockOutAt: Date | null; isOvertimeShift: boolean;
  status: AttendanceStatus; source: AttendanceSource;
  plannedHours: Prisma.Decimal | null; actualHours: Prisma.Decimal | null; regularHours: Prisma.Decimal | null; overtimeHours: Prisma.Decimal | null;
  standardDayHours: Prisma.Decimal | null; dailyRateSnapshot: Prisma.Decimal | null; overtimeRateSnapshot: Prisma.Decimal | null;
  dailyEarnings: Prisma.Decimal | null; overtimeEarnings: Prisma.Decimal | null; totalEarnings: Prisma.Decimal | null;
  clockInPhotoUrl: string | null; clockOutPhotoUrl: string | null;
  employee: { name: string; code: string };
  workShift: ShiftSelect;
};

function toNum(v: Prisma.Decimal | null | undefined): number {
  return v ? Number(v) : 0;
}

async function findEmployee(db: PrismaClient, code: string): Promise<EmployeeSelect | null> {
  return db.employee.findUnique({
    where: { code },
    select: { id: true, name: true, code: true, pinHash: true, status: true, payType: true, dailyRate: true, overtimeHourlyRate: true, standardDayHours: true },
  });
}

async function findShift(db: PrismaClient, shiftId: string): Promise<ShiftSelect | null> {
  return db.workShift.findUnique({ where: { id: shiftId }, select: { id: true, name: true, startTime: true, endTime: true, plannedHours: true, status: true } });
}

function calcRegularHours(actualHours: number, plannedHours: number): number {
  return Math.round(Math.min(actualHours, plannedHours) * 100) / 100;
}

function computeEarnings(
  actualHours: number,
  plannedHours: number,
  standardDayHours: number,
  dailyRate: number,
  overtimeHourlyRate: number,
): { regularHours: number; overtimeHours: number; dailyEarnings: number; overtimeEarnings: number; totalEarnings: number } {
  const regular = calcRegularHours(actualHours, plannedHours);
  const overtime = calcOvertimeHours(actualHours, plannedHours);
  const dailyEarnings = Math.round((dailyRate * (regular / standardDayHours)) * 100) / 100;
  const overtimeEarnings = Math.round((overtime * overtimeHourlyRate) * 100) / 100;
  return {
    regularHours: regular,
    overtimeHours: overtime,
    dailyEarnings,
    overtimeEarnings,
    totalEarnings: dailyEarnings + overtimeEarnings,
  };
}

function defaultOvertimeHourlyRate(dailyRate: number, standardDayHours: number): number {
  if (standardDayHours <= 0) return 0;
  return Math.round((dailyRate / standardDayHours) * 1.5 * 100) / 100;
}

function buildRecordResult(record: RecordWithRelations): AttendanceRecordResult {
  const shift = record.workShift;
  const planned = getEffectivePlannedHours(toNum(shift.plannedHours), shift.startTime, shift.endTime);
  const actual = record.clockInAt && record.clockOutAt ? calcActualHours(record.clockInAt, record.clockOutAt) : null;
  const standardDayHours = toNum(record.standardDayHours) > 0 ? toNum(record.standardDayHours) : 8;
  const dailyRate = toNum(record.dailyRateSnapshot);
  const overtimeRate = toNum(record.overtimeRateSnapshot) > 0
    ? toNum(record.overtimeRateSnapshot)
    : defaultOvertimeHourlyRate(dailyRate, standardDayHours);

  let regular = toNum(record.regularHours);
  let overtime = toNum(record.overtimeHours);
  let dailyEarnings = toNum(record.dailyEarnings);
  let overtimeEarnings = toNum(record.overtimeEarnings);

  if (actual !== null) {
    const computed = computeEarnings(actual, planned, standardDayHours, dailyRate, overtimeRate);
    regular = computed.regularHours;
    overtime = computed.overtimeHours;
    dailyEarnings = computed.dailyEarnings;
    overtimeEarnings = computed.overtimeEarnings;
  }

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
    overtimeHours: overtime,
    regularHours: regular,
    status: record.status,
    source: record.source,
    dailyRateSnapshot: dailyRate,
    overtimeRateSnapshot: overtimeRate,
    dailyEarnings,
    overtimeEarnings,
    totalEarnings: dailyEarnings + overtimeEarnings,
    clockInPhotoUrl: record.clockInPhotoUrl ?? null,
    clockOutPhotoUrl: record.clockOutPhotoUrl ?? null,
  };
}

type AttendanceComputedData = {
  plannedHours: Prisma.Decimal;
  actualHours: Prisma.Decimal | null;
  regularHours: Prisma.Decimal;
  overtimeHours: Prisma.Decimal;
  standardDayHours: Prisma.Decimal;
  dailyEarnings: Prisma.Decimal;
  overtimeEarnings: Prisma.Decimal;
  totalEarnings: Prisma.Decimal;
};

function buildComputedData(record: RecordWithRelations): AttendanceComputedData {
  const shift = record.workShift;
  const planned = getEffectivePlannedHours(toNum(shift.plannedHours), shift.startTime, shift.endTime);
  const standardDayHours = toNum(record.standardDayHours) > 0 ? toNum(record.standardDayHours) : 8;
  const actual = record.clockInAt && record.clockOutAt ? calcActualHours(record.clockInAt, record.clockOutAt) : null;
  if (actual === null || record.status !== 'PRESENT') {
    return {
      plannedHours: new Prisma.Decimal(planned),
      actualHours: null,
      regularHours: new Prisma.Decimal(0),
      overtimeHours: new Prisma.Decimal(0),
      standardDayHours: new Prisma.Decimal(standardDayHours),
      dailyEarnings: new Prisma.Decimal(0),
      overtimeEarnings: new Prisma.Decimal(0),
      totalEarnings: new Prisma.Decimal(0),
    };
  }
  const dailyRate = toNum(record.dailyRateSnapshot);
  const overtimeRate = toNum(record.overtimeRateSnapshot) > 0
    ? toNum(record.overtimeRateSnapshot)
    : defaultOvertimeHourlyRate(dailyRate, standardDayHours);
  const computed = computeEarnings(actual, planned, standardDayHours, dailyRate, overtimeRate);
  return {
    plannedHours: new Prisma.Decimal(planned),
    actualHours: new Prisma.Decimal(actual),
    regularHours: new Prisma.Decimal(computed.regularHours),
    overtimeHours: new Prisma.Decimal(computed.overtimeHours),
    standardDayHours: new Prisma.Decimal(standardDayHours),
    dailyEarnings: new Prisma.Decimal(computed.dailyEarnings),
    overtimeEarnings: new Prisma.Decimal(computed.overtimeEarnings),
    totalEarnings: new Prisma.Decimal(computed.totalEarnings),
  };
}

function getEmployeeRateSnapshots(employee: EmployeeSelect): { dailyRate: number; overtimeHourlyRate: number; standardDayHours: number } {
  const standardDayHours = toNum(employee.standardDayHours) > 0 ? toNum(employee.standardDayHours) : 8;
  // PIECE workers still record hours for discipline, but attendance does not pay.
  if (employee.payType === 'PIECE') {
    return { dailyRate: 0, overtimeHourlyRate: 0, standardDayHours };
  }
  const dailyRate = toNum(employee.dailyRate);
  const overtimeHourlyRate = toNum(employee.overtimeHourlyRate) > 0
    ? toNum(employee.overtimeHourlyRate)
    : defaultOvertimeHourlyRate(dailyRate, standardDayHours);
  return { dailyRate, overtimeHourlyRate, standardDayHours };
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

    const source = input.source ?? 'KIOSK';
    if (source === 'KIOSK') {
      if (!input.clockInPhotoUrl?.trim()) {
        throw new BusinessRuleError('Data absensi tidak lengkap');
      }
      if (!isValidAttendancePhotoUrl(input.clockInPhotoUrl)) {
        throw new BusinessRuleError('Foto absensi tidak valid');
      }
    }

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

    const rates = getEmployeeRateSnapshots(employee);
    const planned = getEffectivePlannedHours(toNum(shift.plannedHours), shift.startTime, shift.endTime);

    const record = await db.attendanceRecord.create({
      data: {
        employeeId: employee.id,
        workDate,
        workShiftId: input.workShiftId,
        clockInAt: now,
        isOvertimeShift: sameDayCount > 0,
        source,
        status: 'PRESENT',
        clockInPhotoUrl: input.clockInPhotoUrl?.trim() || null,
        plannedHours: new Prisma.Decimal(planned),
        standardDayHours: new Prisma.Decimal(rates.standardDayHours),
        dailyRateSnapshot: new Prisma.Decimal(rates.dailyRate),
        overtimeRateSnapshot: new Prisma.Decimal(rates.overtimeHourlyRate),
        regularHours: new Prisma.Decimal(0),
        overtimeHours: new Prisma.Decimal(0),
        dailyEarnings: new Prisma.Decimal(0),
        overtimeEarnings: new Prisma.Decimal(0),
        totalEarnings: new Prisma.Decimal(0),
      },
      include: includeRelations,
    });

    return buildRecordResult(record as unknown as RecordWithRelations);
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

    if (input.clockOutPhotoUrl?.trim() && !isValidAttendancePhotoUrl(input.clockOutPhotoUrl)) {
      throw new BusinessRuleError('Foto absensi tidak valid');
    }

    const now = new Date();
    const updated = await db.attendanceRecord.update({
      where: { id: openRecord.id },
      data: {
        clockOutAt: now,
        ...(input.clockOutPhotoUrl?.trim()
          ? { clockOutPhotoUrl: input.clockOutPhotoUrl.trim() }
          : {}),
      },
      include: includeRelations,
    });

    const computed = buildComputedData(updated as unknown as RecordWithRelations);
    const finalized = await db.attendanceRecord.update({
      where: { id: updated.id },
      data: computed,
      include: includeRelations,
    });

    return buildRecordResult(finalized as unknown as RecordWithRelations);
  },

  /**
   * Admin manual clock-in — skips PIN verification.
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

    const rates = getEmployeeRateSnapshots(employee);
    const planned = getEffectivePlannedHours(toNum(shift.plannedHours), shift.startTime, shift.endTime);

    const record = await db.attendanceRecord.create({
      data: {
        employeeId: employee.id,
        workDate,
        workShiftId: input.workShiftId,
        clockInAt: now,
        isOvertimeShift: sameDayCount > 0,
        source: input.source ?? 'MANUAL',
        status: 'PRESENT',
        plannedHours: new Prisma.Decimal(planned),
        standardDayHours: new Prisma.Decimal(rates.standardDayHours),
        dailyRateSnapshot: new Prisma.Decimal(rates.dailyRate),
        overtimeRateSnapshot: new Prisma.Decimal(rates.overtimeHourlyRate),
        regularHours: new Prisma.Decimal(0),
        overtimeHours: new Prisma.Decimal(0),
        dailyEarnings: new Prisma.Decimal(0),
        overtimeEarnings: new Prisma.Decimal(0),
        totalEarnings: new Prisma.Decimal(0),
      },
      include: includeRelations,
    });

    return buildRecordResult(record as unknown as RecordWithRelations);
  },

  /**
   * Admin manual clock-out — skips PIN verification.
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

    const computed = buildComputedData(updated as unknown as RecordWithRelations);
    const finalized = await db.attendanceRecord.update({
      where: { id: updated.id },
      data: computed,
      include: includeRelations,
    });

    return buildRecordResult(finalized as unknown as RecordWithRelations);
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

    let results = records.map(r => buildRecordResult(r as unknown as RecordWithRelations));

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

    const results = records.map(r => buildRecordResult(r as unknown as RecordWithRelations));
    const uniqueEmployees = new Set(results.map(r => r.employeeId));
    const multiShiftEmployees = new Set(results.filter(r => r.isOvertimeShift).map(r => r.employeeId));

    return {
      date,
      totalEmployees: uniqueEmployees.size,
      totalRecords: results.length,
      multiShiftCount: multiShiftEmployees.size,
      totalActualHours: Math.round(results.reduce((sum, r) => sum + (r.actualHours ?? 0), 0) * 100) / 100,
      totalOvertimeHours: Math.round(results.reduce((sum, r) => sum + r.overtimeHours, 0) * 100) / 100,
      totalDailyEarnings: Math.round(results.reduce((sum, r) => sum + r.dailyEarnings, 0) * 100) / 100,
      totalOvertimeEarnings: Math.round(results.reduce((sum, r) => sum + r.overtimeEarnings, 0) * 100) / 100,
      totalEarnings: Math.round(results.reduce((sum, r) => sum + r.totalEarnings, 0) * 100) / 100,
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

    const employee = await db.employee.findUnique({ where: { id: employeeId }, select: { name: true, code: true, payType: true, dailyRate: true, overtimeHourlyRate: true, standardDayHours: true } });
    if (!employee) throw new NotFoundError('Karyawan tidak ditemukan');

    const shift = await findShift(db, workShiftId);
    if (!shift) throw new NotFoundError('Shift tidak ditemukan');

    const rates = getEmployeeRateSnapshots({
      id: employeeId,
      pinHash: null,
      status: 'ACTIVE',
      ...employee,
    } as EmployeeSelect);
    const planned = getEffectivePlannedHours(toNum(shift.plannedHours), shift.startTime, shift.endTime);

    const record = await db.attendanceRecord.create({
      data: {
        employeeId,
        workDate,
        workShiftId,
        status: 'ABSENT',
        source: 'MANUAL',
        notes,
        plannedHours: new Prisma.Decimal(planned),
        standardDayHours: new Prisma.Decimal(rates.standardDayHours),
        dailyRateSnapshot: new Prisma.Decimal(rates.dailyRate),
        overtimeRateSnapshot: new Prisma.Decimal(rates.overtimeHourlyRate),
        regularHours: new Prisma.Decimal(0),
        overtimeHours: new Prisma.Decimal(0),
        dailyEarnings: new Prisma.Decimal(0),
        overtimeEarnings: new Prisma.Decimal(0),
        totalEarnings: new Prisma.Decimal(0),
      },
      include: includeRelations,
    });

    return buildRecordResult(record as unknown as RecordWithRelations);
  },

  /**
   * Correct an attendance record (admin edit).
   */
  async correct(db: PrismaClient, recordId: string, data: { clockInAt?: Date; clockOutAt?: Date; notes?: string }): Promise<AttendanceRecordResult> {
    const record = await db.attendanceRecord.findUnique({ where: { id: recordId }, include: includeRelations });
    if (!record) throw new NotFoundError('Record tidak ditemukan');

    const updated = await db.attendanceRecord.update({ where: { id: recordId }, data, include: includeRelations });
    const computed = buildComputedData(updated as unknown as RecordWithRelations);
    const finalized = await db.attendanceRecord.update({
      where: { id: updated.id },
      data: computed,
      include: includeRelations,
    });
    return buildRecordResult(finalized as unknown as RecordWithRelations);
  },

  // ─────────────────────────────────────────────────────────────
  // Fase 3: range methods (used by weekly attendance recap + monthly payroll §5)
  // ─────────────────────────────────────────────────────────────

  /**
   * List attendance records in a date range [from, to] inclusive.
   * Reuses same filters as listByDate minus the single-date where.
   */
  async listByRange(db: PrismaClient, from: Date, to: Date, filters?: ListFilters): Promise<AttendanceRecordResult[]> {
    const where: Record<string, unknown> = {
      workDate: { gte: from, lte: to },
    };
    if (filters?.workShiftId) where.workShiftId = filters.workShiftId;

    const records = await db.attendanceRecord.findMany({
      where: where as never,
      include: includeRelations,
      orderBy: [{ employee: { code: 'asc' } }, { workDate: 'asc' }, { clockInAt: 'asc' }],
    });

    let results = records.map(r => buildRecordResult(r as unknown as RecordWithRelations));
    if (filters?.overtimeOnly) {
      results = results.filter(r => r.isOvertimeShift || r.overtimeHours > 0);
    }
    return results;
  },

  /**
   * Weekly summary — aggregate per employee within [weekStart, weekEnd].
   * Used by /hrd/attendance weekly toggle (and also reusable for payroll monthly §5).
   */
  async getWeeklySummary(db: PrismaClient, weekStart: Date, weekEnd: Date): Promise<WeeklyEmployeeSummary[]> {
    const records = await db.attendanceRecord.findMany({
      where: { workDate: { gte: weekStart, lte: weekEnd }, status: 'PRESENT' },
      include: includeRelations,
    });
    const results = records.map(r => buildRecordResult(r as unknown as RecordWithRelations));

    const byEmployee = new Map<string, WeeklyEmployeeSummary>();
    for (const r of results) {
      const key = r.employeeId;
      const existing = byEmployee.get(key) ?? {
        employeeId: r.employeeId,
        employeeCode: r.employeeCode,
        employeeName: r.employeeName,
        daysPresent: 0,
        totalActualHours: 0,
        totalOvertimeHours: 0,
        totalDailyEarnings: 0,
        totalOvertimeEarnings: 0,
        totalEarnings: 0,
      };
      existing.daysPresent += 1;
      existing.totalActualHours += r.actualHours ?? 0;
      existing.totalOvertimeHours += r.overtimeHours ?? 0;
      existing.totalDailyEarnings += r.dailyEarnings ?? 0;
      existing.totalOvertimeEarnings += r.overtimeEarnings ?? 0;
      existing.totalEarnings += r.totalEarnings ?? 0;
      byEmployee.set(key, existing);
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return Array.from(byEmployee.values()).map(s => ({
      ...s,
      totalActualHours: round2(s.totalActualHours),
      totalOvertimeHours: round2(s.totalOvertimeHours),
      totalDailyEarnings: round2(s.totalDailyEarnings),
      totalOvertimeEarnings: round2(s.totalOvertimeEarnings),
      totalEarnings: round2(s.totalEarnings),
    }));
  },

  /**
   * Monthly summary — aggregate per employee for a calendar month.
   * Counts PRESENT / ABSENT / ON_LEAVE records and multi-shift days.
   * Gelombang A1.
   */
  async getMonthlySummary(db: PrismaClient, year: number, month: number): Promise<MonthlyEmployeeSummary[]> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));

    const records = await db.attendanceRecord.findMany({
      where: { workDate: { gte: monthStart, lte: monthEnd } },
      select: {
        employeeId: true,
        workDate: true,
        status: true,
        actualHours: true,
        overtimeHours: true,
        employee: { select: { name: true, code: true } },
      },
      orderBy: [{ employeeId: 'asc' }, { workDate: 'asc' }],
    });

    const byEmployee = new Map<string, MonthlyEmployeeSummary & { _dateCounts: Map<string, number>; _presentDates: Set<string>; _absentDates: Set<string>; _leaveDates: Set<string> }>();
    for (const r of records) {
      let entry = byEmployee.get(r.employeeId);
      if (!entry) {
        entry = {
          employeeId: r.employeeId,
          employeeCode: r.employee.code,
          employeeName: r.employee.name,
          daysPresent: 0,
          daysAbsent: 0,
          daysOnLeave: 0,
          totalActualHours: 0,
          totalOvertimeHours: 0,
          multiShiftDays: 0,
          _dateCounts: new Map(),
          _presentDates: new Set(),
          _absentDates: new Set(),
          _leaveDates: new Set(),
        };
        byEmployee.set(r.employeeId, entry);
      }

      const dateKey = r.workDate.toISOString().slice(0, 10);
      const prevCount = entry._dateCounts.get(dateKey) ?? 0;
      entry._dateCounts.set(dateKey, prevCount + 1);

      if (r.status === 'PRESENT') {
        entry._presentDates.add(dateKey);
        entry.totalActualHours += r.actualHours ? Number(r.actualHours) : 0;
        entry.totalOvertimeHours += r.overtimeHours ? Number(r.overtimeHours) : 0;
      } else if (r.status === 'ABSENT') {
        entry._absentDates.add(dateKey);
      } else if (r.status === 'ON_LEAVE') {
        entry._leaveDates.add(dateKey);
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    return Array.from(byEmployee.values()).map(s => {
      const multiShiftDays = Array.from(s._dateCounts.values()).filter(c => c > 1).length;
      return {
        employeeId: s.employeeId,
        employeeCode: s.employeeCode,
        employeeName: s.employeeName,
        daysPresent: s._presentDates.size,
        daysAbsent: s._absentDates.size,
        daysOnLeave: s._leaveDates.size,
        totalActualHours: round2(s.totalActualHours),
        totalOvertimeHours: round2(s.totalOvertimeHours),
        multiShiftDays,
      };
    });
  },
};
