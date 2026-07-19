'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma as db } from '@/lib/core/prisma';
import { AttendanceService, type ListFilters } from '@/services/hrd/attendance-service';
import { hashPin, isValidPin } from '@/services/hrd/pin-helpers';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { requireAuth } from '@/lib/tools/auth-checks';
import { rateLimit } from '@/lib/api/rate-limit';
import { logActivity } from '@/lib/tools/audit';
import { headers } from 'next/headers';

async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim()
    || h.get('x-real-ip')
    || '127.0.0.1';
}

// ─── PIN management ───

export const setEmployeePin = withTenant(
  async function setEmployeePin(employeeId: string, pin: string) {
    try {
      if (!isValidPin(pin)) {
        return { success: false, error: 'PIN harus 4-6 digit angka' };
      }
      const pinHash = await hashPin(pin);
      await db.employee.update({ where: { id: employeeId }, data: { pinHash } });
      revalidatePath('/dashboard/employees');
      return { success: true };
    } catch (error) {
      logger.error('Failed to set employee PIN', { error, employeeId, module: 'AttendanceActions' });
      return { success: false, error: 'Gagal menyimpan PIN' };
    }
  }
);

export const clearEmployeePin = withTenant(
  async function clearEmployeePin(employeeId: string) {
    try {
      await db.employee.update({ where: { id: employeeId }, data: { pinHash: null } });
      revalidatePath('/dashboard/employees');
      return { success: true };
    } catch (error) {
      logger.error('Failed to clear employee PIN', { error, employeeId, module: 'AttendanceActions' });
      return { success: false, error: 'Gagal menghapus PIN' };
    }
  }
);

// ─── WorkShift plannedHours ───

export const updateWorkShiftPlannedHours = withTenant(
  async function updateWorkShiftPlannedHours(id: string, plannedHours: number | null) {
    try {
      await db.workShift.update({ where: { id }, data: { plannedHours } });
      revalidatePath('/production/shifts');
      return { success: true };
    } catch (error) {
      logger.error('Failed to update planned hours', { error, shiftId: id, module: 'AttendanceActions' });
      return { success: false, error: 'Gagal update jam rencana' };
    }
  }
);

// ─── Attendance actions (admin) ───

export const clockInManual = withTenant(
  async function clockInManual(employeeCode: string, workShiftId: string) {
    try {
      const session = await requireAuth();
      const result = await AttendanceService.clockInAsAdmin(db, { employeeCode, workShiftId, source: 'MANUAL' });
      await logActivity({
        userId: session.user.id,
        action: 'ATTENDANCE_MANUAL_CLOCK',
        entityType: 'AttendanceRecord',
        entityId: result?.id ?? employeeCode,
        details: `Manual clock-IN by admin for ${employeeCode} (shift=${workShiftId})`,
      });
      revalidatePath('/hrd/attendance');
      return { success: true, data: result };
    } catch (error) {
      logger.error('Manual clock-in failed', { error, employeeCode, module: 'AttendanceActions' });
      return { success: false, error: error instanceof Error ? error.message : 'Gagal clock-in manual' };
    }
  }
);

export const clockOutManual = withTenant(
  async function clockOutManual(employeeCode: string) {
    try {
      const session = await requireAuth();
      const result = await AttendanceService.clockOutAsAdmin(db, { employeeCode });
      await logActivity({
        userId: session.user.id,
        action: 'ATTENDANCE_MANUAL_CLOCK',
        entityType: 'AttendanceRecord',
        entityId: result?.id ?? employeeCode,
        details: `Manual clock-OUT by admin for ${employeeCode}`,
      });
      revalidatePath('/hrd/attendance');
      return { success: true, data: result };
    } catch (error) {
      logger.error('Manual clock-out failed', { error, employeeCode, module: 'AttendanceActions' });
      return { success: false, error: error instanceof Error ? error.message : 'Gagal clock-out manual' };
    }
  }
);

export const setAbsent = withTenant(
  async function setAbsent(employeeId: string, workDate: string, workShiftId: string, notes?: string) {
    try {
      const session = await requireAuth();
      const result = await AttendanceService.setAbsent(db, employeeId, new Date(workDate), workShiftId, notes);
      await logActivity({
        userId: session.user.id,
        action: 'ATTENDANCE_MARKED_ABSENT',
        entityType: 'AttendanceRecord',
        entityId: result?.id ?? employeeId,
        details: `Marked ABSENT: employee=${employeeId} date=${workDate} shift=${workShiftId}${notes ? ` notes="${notes}"` : ''}`,
      });
      revalidatePath('/hrd/attendance');
      return { success: true, data: result };
    } catch (error) {
      logger.error('Set absent failed', { error, employeeId, module: 'AttendanceActions' });
      return { success: false, error: error instanceof Error ? error.message : 'Gagal set absent' };
    }
  }
);

export const correctAttendance = withTenant(
  async function correctAttendance(recordId: string, data: { clockInAt?: string; clockOutAt?: string; notes?: string }) {
    try {
      const session = await requireAuth();
      const updateData: { clockInAt?: Date; clockOutAt?: Date; notes?: string } = {};
      if (data.clockInAt !== undefined) updateData.clockInAt = data.clockInAt ? new Date(data.clockInAt) : undefined;
      if (data.clockOutAt !== undefined) updateData.clockOutAt = data.clockOutAt ? new Date(data.clockOutAt) : undefined;
      if (data.notes !== undefined) updateData.notes = data.notes;

      const before = await db.attendanceRecord.findUnique({
        where: { id: recordId },
        select: { id: true, employeeId: true, clockInAt: true, clockOutAt: true, notes: true },
      });
      const result = await AttendanceService.correct(db, recordId, updateData);
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (before) {
        for (const f of ['clockInAt', 'clockOutAt', 'notes'] as const) {
          const oldV = (before as Record<string, unknown>)[f];
          const newV = updateData[f as keyof typeof updateData];
          if (oldV?.toString() !== (newV ? newV.toString() : undefined)) {
            changes[f] = { from: oldV, to: newV };
          }
        }
      }
      await logActivity({
        userId: session.user.id,
        action: 'ATTENDANCE_CORRECTED',
        entityType: 'AttendanceRecord',
        entityId: recordId,
        details: `Corrected attendance record for employee=${before?.employeeId ?? 'unknown'}`,
        changes: Object.keys(changes).length > 0 ? changes : undefined,
      });
      revalidatePath('/hrd/attendance');
      return { success: true, data: result };
    } catch (error) {
      logger.error('Correct attendance failed', { error, recordId, module: 'AttendanceActions' });
      return { success: false, error: error instanceof Error ? error.message : 'Gagal koreksi absensi' };
    }
  }
);

export const listAttendance = withTenant(
  async function listAttendance(date: string, filters?: ListFilters) {
    try {
      const records = await AttendanceService.listByDate(db, new Date(date), filters);
      return { success: true, data: records };
    } catch (error) {
      logger.error('List attendance failed', { error, date, module: 'AttendanceActions' });
      return { success: false, error: 'Gagal memuat data absensi' };
    }
  }
);

export const getAttendanceSummary = withTenant(
  async function getAttendanceSummary(date: string) {
    try {
      const summary = await AttendanceService.getSummary(db, new Date(date));
      return { success: true, data: summary };
    } catch (error) {
      logger.error('Get summary failed', { error, date, module: 'AttendanceActions' });
      return { success: false, error: 'Gagal memuat ringkasan' };
    }
  }
);

// ─── Kiosk actions (public) ───
// Auth failures stay generic (anti-enumeration). Operational messages are safe to surface.
// Rate limited per (IP + employeeCode): 5 attempts per 5 minutes.

const KIOSK_RATE_LIMIT = 5;
const KIOSK_RATE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** Business messages that do not leak whether a code/PIN exists. */
function mapKioskError(error: unknown): string {
  if (!(error instanceof Error)) return 'Kode atau PIN tidak valid';
  const msg = error.message;

  if (msg.startsWith('Masih belum clock-out')) return msg;
  if (msg === 'Sudah absen shift ini hari ini') return msg;
  if (msg === 'Tidak ada sesi absensi yang masih terbuka') return msg;
  if (msg === 'Shift tidak aktif') return 'Shift tidak aktif';
  if (msg === 'Data absensi tidak lengkap' || msg === 'Foto absensi tidak valid') {
    return 'Ambil selfie terlebih dahulu';
  }

  // Karyawan tidak ditemukan / PIN salah / tidak aktif → generic
  return 'Kode atau PIN tidak valid';
}

export type KioskEmployeeOption = {
  id: string;
  name: string;
  code: string;
};

/** Minimal ACTIVE employee list for kiosk name search — never exposes pin/rates. */
export const listKioskEmployees = withTenant(
  async function listKioskEmployees() {
    try {
      const employees = await db.employee.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      });
      return { success: true, data: employees as KioskEmployeeOption[] };
    } catch (error) {
      logger.error('List kiosk employees failed', { error, module: 'AttendanceActions' });
      return { success: false, error: 'Gagal memuat daftar karyawan' };
    }
  }
);

export const kioskClockIn = withTenant(
  async function kioskClockIn(
    employeeCode: string,
    pin: string,
    workShiftId: string,
    clockInPhotoUrl: string,
  ) {
    try {
      const ip = await getClientIp();
      const { success } = rateLimit(`kiosk:${ip}:${employeeCode}`, KIOSK_RATE_LIMIT, KIOSK_RATE_WINDOW_MS);
      if (!success) {
        return { success: false, error: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.' };
      }

      if (!clockInPhotoUrl?.trim()) {
        return { success: false, error: 'Ambil selfie terlebih dahulu' };
      }

      const result = await AttendanceService.clockIn(db, {
        employeeCode,
        pin,
        workShiftId,
        clockInPhotoUrl: clockInPhotoUrl.trim(),
      });
      revalidatePath('/kiosk/attendance');
      revalidatePath('/hrd/attendance');
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: mapKioskError(error) };
    }
  }
);

export const kioskClockOut = withTenant(
  async function kioskClockOut(
    employeeCode: string,
    pin: string,
    clockOutPhotoUrl?: string,
  ) {
    try {
      const ip = await getClientIp();
      const { success } = rateLimit(`kiosk:${ip}:${employeeCode}`, KIOSK_RATE_LIMIT, KIOSK_RATE_WINDOW_MS);
      if (!success) {
        return { success: false, error: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.' };
      }

      const result = await AttendanceService.clockOut(db, {
        employeeCode,
        pin,
        clockOutPhotoUrl: clockOutPhotoUrl?.trim() || undefined,
      });
      revalidatePath('/kiosk/attendance');
      revalidatePath('/hrd/attendance');
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: mapKioskError(error) };
    }
  }
);
