'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
    safeAction,
    AuthorizationError,
} from '@/lib/errors/errors';
import { isTenantAdmin } from '@/lib/auth/roles';

const ATTENDANCE_SETTING_KEYS = [
    'attendance.selfServiceEnabled',
    'attendance.geofenceEnabled',
    'attendance.latitude',
    'attendance.longitude',
    'attendance.radiusMeters',
    'attendance.maxAccuracyMeters',
    'attendance.lateGraceMinutes',
] as const;

export interface AttendanceSettings {
    selfServiceEnabled: boolean;
    geofenceEnabled: boolean;
    latitude: string;
    longitude: string;
    radiusMeters: string;
    maxAccuracyMeters: string;
    lateGraceMinutes: string;
}

const saveSchema = z.object({
    selfServiceEnabled: z.boolean(),
    geofenceEnabled: z.boolean(),
    latitude: z.string().refine((v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) && n >= -90 && n <= 90;
    }, 'Latitude harus antara -90 dan 90'),
    longitude: z.string().refine((v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) && n >= -180 && n <= 180;
    }, 'Longitude harus antara -180 dan 180'),
    radiusMeters: z.string().refine((v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) && n > 0;
    }, 'Radius harus lebih dari 0'),
    maxAccuracyMeters: z.string().refine((v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) && n > 0;
    }, 'Akurasi maks harus lebih dari 0'),
    lateGraceMinutes: z.string().refine((v) => {
        const n = parseInt(v, 10);
        return Number.isFinite(n) && n >= 0;
    }, 'Grace period harus 0 atau lebih'),
});

async function requireAdminId(): Promise<string> {
    const session = await auth();
    if (!session?.user || !isTenantAdmin(session.user)) {
        throw new AuthorizationError(
            'Hanya admin yang dapat mengubah pengaturan absensi.',
        );
    }
    const id = session.user.id;
    if (!id) throw new AuthorizationError('Sesi tidak valid.');
    return id;
}

export const getAttendanceSettings = withTenant(
    async function getAttendanceSettings() {
        return safeAction(async () => {
            await requireAdminId();
            const rows = await prisma.appSetting.findMany({
                where: { key: { in: [...ATTENDANCE_SETTING_KEYS] } },
                select: { key: true, value: true },
            });
            const byKey = new Map(rows.map((r) => [r.key, r.value]));
            const get = (k: string) => byKey.get(k) ?? '';
            return {
                selfServiceEnabled: get('attendance.selfServiceEnabled') === 'true',
                geofenceEnabled: get('attendance.geofenceEnabled') === 'true',
                latitude: get('attendance.latitude'),
                longitude: get('attendance.longitude'),
                radiusMeters: get('attendance.radiusMeters'),
                maxAccuracyMeters: get('attendance.maxAccuracyMeters'),
                lateGraceMinutes: get('attendance.lateGraceMinutes'),
            } satisfies AttendanceSettings;
        });
    },
);

export const saveAttendanceSettings = withTenant(
    async function saveAttendanceSettings(input: AttendanceSettings) {
        return safeAction(async () => {
            const adminId = await requireAdminId();
            const parsed = saveSchema.parse(input);

            const entries: Record<string, string> = {
                'attendance.selfServiceEnabled': String(parsed.selfServiceEnabled),
                'attendance.geofenceEnabled': String(parsed.geofenceEnabled),
                'attendance.latitude': parsed.latitude,
                'attendance.longitude': parsed.longitude,
                'attendance.radiusMeters': parsed.radiusMeters,
                'attendance.maxAccuracyMeters': parsed.maxAccuracyMeters,
                'attendance.lateGraceMinutes': parsed.lateGraceMinutes,
            };

            await prisma.$transaction(
                Object.entries(entries).map(([key, value]) =>
                    prisma.appSetting.upsert({
                        where: { key },
                        create: { key, value, updatedBy: adminId },
                        update: { value, updatedBy: adminId },
                    }),
                ),
            );

            revalidatePath('/hrd/attendance');
            return { success: true };
        });
    },
);
