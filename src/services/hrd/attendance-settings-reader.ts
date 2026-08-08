import { PrismaClient } from '@prisma/client';

const ATTENDANCE_KEYS = [
    'attendance.selfServiceEnabled',
    'attendance.geofenceEnabled',
    'attendance.geofenceMode',
    'attendance.latitude',
    'attendance.longitude',
    'attendance.radiusMeters',
    'attendance.maxAccuracyMeters',
    'attendance.lateGraceMinutes',
];

/**
 * Read attendance settings from AppSetting table.
 * Returns a Record<string, string | null> for use with attendance-location helpers.
 */
export async function readAttendanceSettings(
    db: PrismaClient,
): Promise<Record<string, string | null>> {
    const rows = await db.appSetting.findMany({
        where: { key: { in: ATTENDANCE_KEYS } },
        select: { key: true, value: true },
    });
    const result: Record<string, string | null> = {};
    for (const key of ATTENDANCE_KEYS) {
        result[key] = null;
    }
    for (const row of rows) {
        result[row.key] = row.value;
    }
    return result;
}
