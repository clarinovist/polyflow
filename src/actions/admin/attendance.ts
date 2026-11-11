'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma as db } from '@/lib/core/prisma';
import {
    AttendanceService,
    type AttendanceRecordResult,
    type ListFilters,
} from '@/services/hrd/attendance-service';
import {
    findStaleOpenSessions,
    readConfiguredRadius,
    withAttendanceFlags,
    type AttendanceRecordWithFlags,
} from '@/services/hrd/attendance-query-service';
import {
    AttendanceRosterService,
    parseRosterDate,
} from '@/services/hrd/attendance-roster-service';
import { hashPin, isValidPin } from '@/services/hrd/pin-helpers';
import { parseWibDateTime } from '@/services/hrd/shift-window';
import { readAttendanceSettings } from '@/services/hrd/attendance-settings-reader';
import {
    getLateGraceMinutes,
    resolveGeofenceMode,
} from '@/services/hrd/attendance-location';
import {
    parseKioskLocationEvidence,
    type KioskLocationEvidenceInput,
} from '@/services/hrd/kiosk-location-evidence';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/config/logger';
import { BusinessRuleError, isNextControlFlowError } from '@/lib/errors/errors';
import { checkKioskRateLimit } from '@/lib/hrd/kiosk-guard';
import { logActivity } from '@/lib/tools/audit';
import { requireHrdApprover, requireHrdFinance } from '@/lib/auth/hrd-access';

// ─── Access guard ───

const ACCESS_DENIED_ERROR = 'Anda tidak memiliki akses untuk aksi ini';

type HrdSession = Awaited<ReturnType<typeof requireHrdFinance>>;
type HrdGuard = () => Promise<HrdSession>;
type GuardResult =
    | { session: HrdSession; denied?: undefined }
    | { session?: undefined; denied: { success: false; error: string } };

/**
 * Jalankan guard peran HRD. Redirect login dilempar ulang; penolakan peran
 * menjadi balikan gagal generik (tanpa detail peran); error lain dilempar
 * ke catch pemanggil supaya dicatat.
 */
async function runHrdGuard(guard: HrdGuard): Promise<GuardResult> {
    try {
        return { session: await guard() };
    } catch (error) {
        if (isNextControlFlowError(error)) throw error;
        if (error instanceof BusinessRuleError) {
            return { denied: { success: false, error: ACCESS_DENIED_ERROR } };
        }
        throw error;
    }
}

// ─── PIN management ───

export const setEmployeePin = withTenant(async function setEmployeePin(
    employeeId: string,
    pin: string,
) {
    try {
        const guard = await runHrdGuard(requireHrdApprover);
        if (guard.denied) return guard.denied;
        if (!isValidPin(pin)) {
            return { success: false, error: 'PIN harus 4-6 digit angka' };
        }
        const pinHash = await hashPin(pin);
        await db.employee.update({
            where: { id: employeeId },
            data: { pinHash },
        });
        // Jangan pernah mencatat PIN atau hash di audit.
        await logActivity({
            userId: guard.session.user.id,
            action: 'EMPLOYEE_PIN_SET',
            entityType: 'Employee',
            entityId: employeeId,
            details: `PIN karyawan diatur: employee=${employeeId}`,
        });
        revalidatePath('/dashboard/employees');
        return { success: true };
    } catch (error) {
        if (isNextControlFlowError(error)) throw error;
        logger.error('Failed to set employee PIN', {
            error,
            employeeId,
            module: 'AttendanceActions',
        });
        return { success: false, error: 'Gagal menyimpan PIN' };
    }
});

export const clearEmployeePin = withTenant(async function clearEmployeePin(
    employeeId: string,
) {
    try {
        const guard = await runHrdGuard(requireHrdApprover);
        if (guard.denied) return guard.denied;
        await db.employee.update({
            where: { id: employeeId },
            data: { pinHash: null },
        });
        await logActivity({
            userId: guard.session.user.id,
            action: 'EMPLOYEE_PIN_CLEARED',
            entityType: 'Employee',
            entityId: employeeId,
            details: `PIN karyawan dihapus: employee=${employeeId}`,
        });
        revalidatePath('/dashboard/employees');
        return { success: true };
    } catch (error) {
        if (isNextControlFlowError(error)) throw error;
        logger.error('Failed to clear employee PIN', {
            error,
            employeeId,
            module: 'AttendanceActions',
        });
        return { success: false, error: 'Gagal menghapus PIN' };
    }
});

export const setAbsent = withTenant(async function setAbsent(
    employeeId: string,
    workDate: string,
    workShiftId: string,
    notes?: string,
) {
    try {
        const guard = await runHrdGuard(requireHrdApprover);
        if (guard.denied) return guard.denied;
        const session = guard.session;
        const result = await AttendanceService.setAbsent(
            db,
            employeeId,
            new Date(workDate),
            workShiftId,
            notes,
        );
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
        // Redirect ke /login dari guard bukan kegagalan: lempar ulang.
        if (isNextControlFlowError(error)) throw error;
        logger.error('Set absent failed', {
            error,
            employeeId,
            module: 'AttendanceActions',
        });
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Gagal set absent',
        };
    }
});

export const correctAttendance = withTenant(async function correctAttendance(
    recordId: string,
    data: { clockInAt?: string; clockOutAt?: string; notes?: string },
) {
    try {
        const guard = await runHrdGuard(requireHrdApprover);
        if (guard.denied) return guard.denied;
        const session = guard.session;
        const updateData: {
            clockInAt?: Date;
            clockOutAt?: Date;
            notes?: string;
        } = {};
        // Jam dari form HRD selalu bersemantik WIB — jangan ikut TZ container.
        if (data.clockInAt !== undefined)
            updateData.clockInAt = data.clockInAt
                ? parseWibDateTime(data.clockInAt)
                : undefined;
        if (data.clockOutAt !== undefined)
            updateData.clockOutAt = data.clockOutAt
                ? parseWibDateTime(data.clockOutAt)
                : undefined;
        if (data.notes !== undefined) updateData.notes = data.notes;

        const before = await db.attendanceRecord.findUnique({
            where: { id: recordId },
            select: {
                id: true,
                employeeId: true,
                clockInAt: true,
                clockOutAt: true,
                notes: true,
            },
        });
        const result = await AttendanceService.correct(
            db,
            recordId,
            updateData,
        );
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
        // Redirect ke /login dari guard bukan kegagalan: lempar ulang.
        if (isNextControlFlowError(error)) throw error;
        logger.error('Correct attendance failed', {
            error,
            recordId,
            module: 'AttendanceActions',
        });
        return {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : 'Gagal koreksi absensi',
        };
    }
});

/** Muat setelan + jam mulai shift SEKALI untuk semua record (bukan per record). */
async function attachAttendanceFlags(
    records: AttendanceRecordResult[],
    workDate: Date,
): Promise<AttendanceRecordWithFlags[]> {
    if (records.length === 0) return [];
    const shiftIds = Array.from(new Set(records.map((r) => r.workShiftId)));
    const [settings, shifts] = await Promise.all([
        readAttendanceSettings(db),
        db.workShift.findMany({
            where: { id: { in: shiftIds } },
            select: { id: true, startTime: true },
        }),
    ]);
    return withAttendanceFlags(records, {
        workDate: workDate.toISOString().slice(0, 10),
        graceMinutes: getLateGraceMinutes(settings),
        radiusMeters: readConfiguredRadius(settings),
        shiftStartTimes: new Map(shifts.map((s) => [s.id, s.startTime])),
    });
}

export const listAttendance = withTenant(async function listAttendance(
    date: string,
    filters?: ListFilters,
) {
    try {
        const guard = await runHrdGuard(requireHrdFinance);
        if (guard.denied) return guard.denied;
        const workDate = new Date(date);
        const records = await AttendanceService.listByDate(
            db,
            workDate,
            filters,
        );
        return {
            success: true,
            data: await attachAttendanceFlags(records, workDate),
        };
    } catch (error) {
        if (isNextControlFlowError(error)) throw error;
        logger.error('List attendance failed', {
            error,
            date,
            module: 'AttendanceActions',
        });
        return { success: false, error: 'Gagal memuat data absensi' };
    }
});

/** Karyawan ACTIVE yang belum punya record pada tanggal itu (Senin–Sabtu). */
export const listNoRecordAttendance = withTenant(
    async function listNoRecordAttendance(date: string) {
        try {
            const guard = await runHrdGuard(requireHrdFinance);
            if (guard.denied) return guard.denied;
            const workDate = parseRosterDate(date);
            if (!workDate) {
                return { success: false, error: 'Tanggal tidak valid' };
            }
            const roster = await AttendanceRosterService.listNoRecord(
                db,
                workDate,
            );
            return { success: true, data: roster };
        } catch (error) {
            if (isNextControlFlowError(error)) throw error;
            logger.error('List no-record attendance failed', {
                error,
                date,
                module: 'AttendanceActions',
            });
            return {
                success: false,
                error: 'Gagal memuat daftar belum absen',
            };
        }
    },
);

/**
 * Sesi PRESENT yang lupa pulang (> 20 jam tanpa jam pulang, 60 hari terakhir).
 * Baca saja; koreksi tetap lewat `correctAttendance`.
 */
export const listStaleOpenSessions = withTenant(
    async function listStaleOpenSessions() {
        try {
            const guard = await runHrdGuard(requireHrdFinance);
            if (guard.denied) return guard.denied;
            const data = await findStaleOpenSessions(db, new Date());
            return { success: true, data };
        } catch (error) {
            if (isNextControlFlowError(error)) throw error;
            logger.error('List stale open sessions failed', {
                error,
                module: 'AttendanceActions',
            });
            return {
                success: false,
                error: 'Gagal memuat sesi belum pulang',
            };
        }
    },
);

export const getAttendanceSummary = withTenant(
    async function getAttendanceSummary(date: string) {
        try {
            const guard = await runHrdGuard(requireHrdFinance);
            if (guard.denied) return guard.denied;
            const summary = await AttendanceService.getSummary(
                db,
                new Date(date),
            );
            return { success: true, data: summary };
        } catch (error) {
            if (isNextControlFlowError(error)) throw error;
            logger.error('Get summary failed', {
                error,
                date,
                module: 'AttendanceActions',
            });
            return { success: false, error: 'Gagal memuat ringkasan' };
        }
    },
);
export const getAttendanceWeeklySummary = withTenant(
    async function getAttendanceWeeklySummary(
        weekStart: string,
        weekEnd: string,
    ) {
        try {
            const guard = await runHrdGuard(requireHrdFinance);
            if (guard.denied) return guard.denied;
            const summary = await AttendanceService.getWeeklySummary(
                db,
                new Date(weekStart),
                new Date(weekEnd),
            );
            return { success: true, data: summary };
        } catch (error) {
            if (isNextControlFlowError(error)) throw error;
            logger.error('Get weekly summary failed', {
                error,
                weekStart,
                weekEnd,
                module: 'AttendanceActions',
            });
            return { success: false, error: 'Gagal memuat rekap mingguan' };
        }
    },
);

// ─── Gelombang A1: monthly recap ───

export const getAttendanceMonthlySummary = withTenant(
    async function getAttendanceMonthlySummary(year: number, month: number) {
        try {
            const guard = await runHrdGuard(requireHrdFinance);
            if (guard.denied) return guard.denied;
            const summary = await AttendanceService.getMonthlySummary(
                db,
                year,
                month,
            );
            return { success: true, data: summary };
        } catch (error) {
            if (isNextControlFlowError(error)) throw error;
            logger.error('Get monthly summary failed', {
                error,
                year,
                month,
                module: 'AttendanceActions',
            });
            return { success: false, error: 'Gagal memuat rekap bulanan' };
        }
    },
);

// ─── Kiosk actions (public) ───
// Auth failures stay generic (anti-enumeration). Operational messages are safe to surface.
// Rate limited per (IP + employeeCode): 5 attempts per 5 minutes.

export async function mapKioskError(error: unknown): Promise<string> {
    if (!(error instanceof Error))
        return 'Terjadi kesalahan pada sistem absensi';
    const msg = error.message;

    if (msg.startsWith('Masih belum clock-out')) return msg;
    if (msg === 'Sudah absen shift ini hari ini') return msg;
    if (msg === 'Tidak ada sesi absensi yang masih terbuka') return msg;
    if (msg === 'Shift tidak aktif') return 'Shift kerja tidak aktif';
    if (msg === 'PIN salah') return 'PIN yang Anda masukkan salah';
    if (msg === 'Karyawan tidak aktif')
        return 'Akun karyawan sedang tidak aktif';
    if (msg === 'Karyawan tidak ditemukan')
        return 'Data karyawan tidak ditemukan';
    if (msg.includes('Tidak ada shift aktif'))
        return 'Tidak ada shift kerja aktif terdaftar';
    if (
        msg === 'Data absensi tidak lengkap' ||
        msg === 'Foto absensi tidak valid'
    ) {
        return 'Ambil selfie terlebih dahulu';
    }

    return msg || 'Gagal memproses absensi';
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
            logger.error('List kiosk employees failed', {
                error,
                module: 'AttendanceActions',
            });
            return { success: false, error: 'Gagal memuat daftar karyawan' };
        }
    },
);

/**
 * The kiosk needs the mode to decide whether a missing GPS fix should stop the
 * form. Under `enforce` it must, because the server will reject anyway and
 * failing early saves the operator a PIN and a selfie. Under `observe` it must
 * not: a phone with location permission denied still has to be able to clock
 * in, or observation becomes the very blocker it exists to remove.
 *
 * Only the mode is exposed — this route is unauthenticated, and the office
 * coordinates are not needed to make that decision.
 */
export const getKioskGeofenceMode = withTenant(
    async function getKioskGeofenceMode() {
        try {
            const settings = await readAttendanceSettings(db);
            return { success: true, data: resolveGeofenceMode(settings) };
        } catch (error) {
            logger.error('Read kiosk geofence mode failed', {
                error,
                module: 'AttendanceActions',
            });
            // Treat an unreadable setting as the permissive mode. The kiosk
            // gate is a convenience; the server still enforces independently.
            return { success: true, data: 'off' as const };
        }
    },
);

export const kioskClockIn = withTenant(async function kioskClockIn(
    employeeCode: string,
    pin: string,
    workShiftId: string | undefined,
    clockInPhotoUrl: string,
    locationEvidence?: KioskLocationEvidenceInput,
) {
    try {
        if (!(await checkKioskRateLimit(employeeCode))) {
            return {
                success: false,
                error: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.',
            };
        }

        if (!clockInPhotoUrl?.trim()) {
            return { success: false, error: 'Ambil selfie terlebih dahulu' };
        }

        const parsedLocation = parseKioskLocationEvidence(locationEvidence);
        if (!parsedLocation.success) {
            return { success: false, error: parsedLocation.error };
        }

        const settings = await readAttendanceSettings(db);

        const result = await AttendanceService.clockIn(
            db,
            {
                employeeCode,
                pin,
                workShiftId: workShiftId?.trim() || undefined,
                clockInPhotoUrl: clockInPhotoUrl.trim(),
                locationEvidence: parsedLocation.data,
            },
            settings,
        );
        revalidatePath('/kiosk/attendance');
        revalidatePath('/hrd/attendance');
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: await mapKioskError(error) };
    }
});

export const kioskClockOut = withTenant(async function kioskClockOut(
    employeeCode: string,
    pin: string,
    clockOutPhotoUrl?: string,
    locationEvidence?: KioskLocationEvidenceInput,
) {
    try {
        if (!(await checkKioskRateLimit(employeeCode))) {
            return {
                success: false,
                error: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.',
            };
        }

        const parsedLocation = parseKioskLocationEvidence(locationEvidence);
        if (!parsedLocation.success) {
            return { success: false, error: parsedLocation.error };
        }

        const settings = await readAttendanceSettings(db);

        const result = await AttendanceService.clockOut(
            db,
            {
                employeeCode,
                pin,
                clockOutPhotoUrl: clockOutPhotoUrl?.trim() || undefined,
                locationEvidence: parsedLocation.data,
            },
            settings,
        );
        revalidatePath('/kiosk/attendance');
        revalidatePath('/hrd/attendance');
        return { success: true, data: result };
    } catch (error) {
        return { success: false, error: await mapKioskError(error) };
    }
});
