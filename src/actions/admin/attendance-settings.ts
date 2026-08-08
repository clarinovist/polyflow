'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { withTenant } from '@/lib/core/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { safeAction, AuthorizationError } from '@/lib/errors/errors';
import { isTenantAdmin } from '@/lib/auth/roles';
import {
    resolveGeofenceMode,
    type GeofenceMode,
} from '@/services/hrd/attendance-location';

const ATTENDANCE_SETTING_KEYS = [
    'attendance.selfServiceEnabled',
    'attendance.geofenceEnabled',
    'attendance.geofenceMode',
    'attendance.latitude',
    'attendance.longitude',
    'attendance.radiusMeters',
    'attendance.maxAccuracyMeters',
    'attendance.lateGraceMinutes',
] as const;

export interface AttendanceSettings {
    selfServiceEnabled: boolean;
    geofenceMode: GeofenceMode;
    latitude: string;
    longitude: string;
    radiusMeters: string;
    maxAccuracyMeters: string;
    lateGraceMinutes: string;
}

const saveSchema = z
    .object({
        selfServiceEnabled: z.boolean(),
        geofenceMode: z.enum(['off', 'observe', 'enforce']),
        latitude: z.string(),
        longitude: z.string(),
        radiusMeters: z.string(),
        maxAccuracyMeters: z.string(),
        lateGraceMinutes: z.string(),
    })
    .superRefine((data, ctx) => {
        // `observe` needs coordinates too — without them there is nothing to
        // measure distance against, and the observation collects positions with
        // no reference point, which is the data we are trying to produce.
        if (data.geofenceMode !== 'off') {
            const lat = parseFloat(data.latitude);
            if (
                !data.latitude.trim() ||
                !Number.isFinite(lat) ||
                lat < -90 ||
                lat > 90
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['latitude'],
                    message: 'Latitude harus antara -90 dan 90',
                });
            }

            const lon = parseFloat(data.longitude);
            if (
                !data.longitude.trim() ||
                !Number.isFinite(lon) ||
                lon < -180 ||
                lon > 180
            ) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['longitude'],
                    message: 'Longitude harus antara -180 dan 180',
                });
            }
        } else {
            if (data.latitude.trim()) {
                const lat = parseFloat(data.latitude);
                if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['latitude'],
                        message: 'Latitude harus antara -90 dan 90',
                    });
                }
            }
            if (data.longitude.trim()) {
                const lon = parseFloat(data.longitude);
                if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ['longitude'],
                        message: 'Longitude harus antara -180 dan 180',
                    });
                }
            }
        }

        if (data.radiusMeters.trim()) {
            const r = parseFloat(data.radiusMeters);
            if (!Number.isFinite(r) || r <= 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['radiusMeters'],
                    message: 'Radius harus lebih dari 0',
                });
            }
        }

        if (data.maxAccuracyMeters.trim()) {
            const acc = parseFloat(data.maxAccuracyMeters);
            if (!Number.isFinite(acc) || acc <= 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['maxAccuracyMeters'],
                    message: 'Akurasi maks harus lebih dari 0',
                });
            }
        }

        if (data.lateGraceMinutes.trim()) {
            const g = parseInt(data.lateGraceMinutes, 10);
            if (!Number.isFinite(g) || g < 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['lateGraceMinutes'],
                    message: 'Grace period harus 0 atau lebih',
                });
            }
        }
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
                selfServiceEnabled:
                    get('attendance.selfServiceEnabled') === 'true',
                // Same resolver the service uses, so the page can never show a
                // mode different from the one actually being applied.
                geofenceMode: resolveGeofenceMode({
                    'attendance.geofenceMode': get('attendance.geofenceMode'),
                    'attendance.geofenceEnabled': get(
                        'attendance.geofenceEnabled',
                    ),
                }),
                latitude: get('attendance.latitude'),
                longitude: get('attendance.longitude'),
                radiusMeters: get('attendance.radiusMeters') || '100',
                maxAccuracyMeters: get('attendance.maxAccuracyMeters') || '50',
                lateGraceMinutes: get('attendance.lateGraceMinutes') || '0',
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
                'attendance.selfServiceEnabled': String(
                    parsed.selfServiceEnabled,
                ),
                'attendance.geofenceMode': parsed.geofenceMode,
                // The legacy boolean is kept in sync so that rolling the image
                // back to a build without mode support degrades safely: an
                // `observe` tenant reads as geofence-off (everyone can clock
                // in) rather than as geofence-on with an untested radius
                // (nobody can).
                'attendance.geofenceEnabled': String(
                    parsed.geofenceMode === 'enforce',
                ),
                'attendance.latitude': parsed.latitude.trim(),
                'attendance.longitude': parsed.longitude.trim(),
                'attendance.radiusMeters': parsed.radiusMeters.trim() || '100',
                'attendance.maxAccuracyMeters':
                    parsed.maxAccuracyMeters.trim() || '50',
                'attendance.lateGraceMinutes':
                    parsed.lateGraceMinutes.trim() || '0',
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
            revalidatePath('/dashboard/settings');
            return { success: true };
        });
    },
);
