'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma as db } from '@/lib/core/prisma';
import { getEmployeeSession } from '@/lib/auth/employee-session';
import {
    AttendanceService,
} from '@/services/hrd/attendance-service';
import { isSelfServiceEnabled, parseGeofenceConfig } from '@/services/hrd/attendance-location';
import { readAttendanceSettings } from '@/services/hrd/attendance-settings-reader';
import { rateLimit } from '@/lib/api/rate-limit';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

const SELF_SERVICE_RATE_LIMIT = 10;
const SELF_SERVICE_RATE_WINDOW_MS = 5 * 60 * 1000;

async function getClientIp(): Promise<string> {
    const h = await headers();
    return (
        h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        h.get('x-real-ip') ||
        'unknown'
    );
}

function mapError(error: unknown): string {
    const msg = (error as Error).message ?? '';
    // Pass-through known business errors with actionable messages
    if (msg.includes('belum diaktifkan') || msg.includes('belum lengkap')) {
        return msg;
    }
    if (msg.includes('tidak ditemukan') || msg.includes('tidak aktif')) {
        return msg;
    }
    if (msg.includes('belum menetapkan')) {
        return msg;
    }
    if (
        msg.includes('belum clock-out') ||
        msg.includes('Sudah absen') ||
        msg.includes('masih terbuka') ||
        msg.includes('koreksi HRD')
    ) {
        return msg;
    }
    if (msg.includes('Lokasi') || msg.includes('Akurasi')) {
        return msg;
    }
    if (msg.includes('Foto')) {
        return msg;
    }
    return 'Gagal memproses absensi. Silakan coba lagi.';
}

export const selfServiceClockIn = withTenant(
    async function selfServiceClockIn(
        clockInPhotoUrl: string,
        locationEvidence: { latitude: number; longitude: number; accuracy: number },
    ) {
        try {
            const session = await getEmployeeSession();
            if (!session) return { success: false, error: 'Unauthorized' };

            const ip = await getClientIp();
            const { success: rateOk } = rateLimit(
                `self-attendance:${ip}:${session.employeeId}`,
                SELF_SERVICE_RATE_LIMIT,
                SELF_SERVICE_RATE_WINDOW_MS,
            );
            if (!rateOk) {
                return {
                    success: false,
                    error: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.',
                };
            }

            const settings = await readAttendanceSettings(db);

            if (!isSelfServiceEnabled(settings)) {
                return {
                    success: false,
                    error: 'Self-service absensi belum diaktifkan oleh HRD',
                };
            }

            const geoConfig = parseGeofenceConfig(settings);
            if (geoConfig && !locationEvidence) {
                return {
                    success: false,
                    error: 'Lokasi wajib untuk absensi',
                };
            }

            const result = await AttendanceService.clockInSelfService(
                db,
                {
                    employeeId: session.employeeId,
                    clockInPhotoUrl,
                    locationEvidence,
                },
                settings,
            );

            revalidatePath('/my/absensi');
            revalidatePath('/hrd/attendance');
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: mapError(error) };
        }
    },
);

export const selfServiceClockOut = withTenant(
    async function selfServiceClockOut(
        locationEvidence: { latitude: number; longitude: number; accuracy: number },
        clockOutPhotoUrl?: string,
    ) {
        try {
            const session = await getEmployeeSession();
            if (!session) return { success: false, error: 'Unauthorized' };

            const ip = await getClientIp();
            const { success: rateOk } = rateLimit(
                `self-attendance:${ip}:${session.employeeId}`,
                SELF_SERVICE_RATE_LIMIT,
                SELF_SERVICE_RATE_WINDOW_MS,
            );
            if (!rateOk) {
                return {
                    success: false,
                    error: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.',
                };
            }

            const settings = await readAttendanceSettings(db);

            if (!isSelfServiceEnabled(settings)) {
                return {
                    success: false,
                    error: 'Self-service absensi belum diaktifkan oleh HRD',
                };
            }

            const result = await AttendanceService.clockOutSelfService(
                db,
                {
                    employeeId: session.employeeId,
                    clockOutPhotoUrl,
                    locationEvidence,
                },
                settings,
            );

            revalidatePath('/my/absensi');
            revalidatePath('/hrd/attendance');
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: mapError(error) };
        }
    },
);

export const getMyTodayAttendance = withTenant(
    async function getMyTodayAttendance() {
        try {
            const session = await getEmployeeSession();
            if (!session) return { success: false, error: 'Unauthorized' };

            const status = await AttendanceService.getMyTodayStatus(
                db,
                session.employeeId,
            );

            return { success: true, data: status };
        } catch (error) {
            return {
                success: false,
                error: (error as Error).message ?? 'Gagal memuat status absensi',
            };
        }
    },
);
