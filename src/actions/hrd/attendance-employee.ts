'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import {
    AttendanceService,
    type AttendanceRecordResult,
} from '@/services/hrd/attendance-service';
import {
    readConfiguredRadius,
    withAttendanceFlags,
    type AttendanceRecordWithFlags,
} from '@/services/hrd/attendance-query-service';
import { readAttendanceSettings } from '@/services/hrd/attendance-settings-reader';
import { getLateGraceMinutes } from '@/services/hrd/attendance-location';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { logger } from '@/lib/config/logger';

const ISO_DATE_LENGTH = 10;

function defaultMonthBound(monthOffset: number, day: number): Date {
    const now = new Date();
    return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, day),
    );
}

function groupByWorkDate(
    records: AttendanceRecordResult[],
): Map<string, AttendanceRecordResult[]> {
    const groups = new Map<string, AttendanceRecordResult[]>();
    for (const record of records) {
        const key = new Date(record.workDate)
            .toISOString()
            .slice(0, ISO_DATE_LENGTH);
        groups.set(key, [...(groups.get(key) ?? []), record]);
    }
    return groups;
}

/**
 * Setelan + jam mulai shift dibaca SEKALI untuk semua record (jumlah query
 * tetap); terlambat dihitung per hari kerja di memori lewat withAttendanceFlags.
 */
async function attachFlags(
    records: AttendanceRecordResult[],
): Promise<AttendanceRecordWithFlags[]> {
    if (records.length === 0) return [];
    const shiftIds = Array.from(new Set(records.map((r) => r.workShiftId)));
    const [settings, shifts] = await Promise.all([
        readAttendanceSettings(prisma),
        prisma.workShift.findMany({
            where: { id: { in: shiftIds } },
            select: { id: true, startTime: true },
        }),
    ]);
    const shiftStartTimes = new Map(shifts.map((s) => [s.id, s.startTime]));
    const graceMinutes = getLateGraceMinutes(settings);
    const radiusMeters = readConfiguredRadius(settings);

    return Array.from(groupByWorkDate(records)).flatMap(([workDate, group]) =>
        withAttendanceFlags(group, {
            workDate,
            graceMinutes,
            radiusMeters,
            shiftStartTimes,
        }),
    );
}

export const listAttendanceByEmployee = withTenant(
    async function listAttendanceByEmployee(
        employeeId: string,
        from?: string,
        to?: string,
    ) {
        return safeAction(async () => {
            try {
                await requireHrdFinance();
                const records = await AttendanceService.listByEmployee(
                    prisma,
                    employeeId,
                    from ? new Date(from) : defaultMonthBound(0, 1),
                    to ? new Date(to) : defaultMonthBound(1, 0),
                );
                return await attachFlags(records);
            } catch (error) {
                logger.error('Failed to list attendance by employee', {
                    error,
                    employeeId,
                    module: 'AttendanceEmployeeActions',
                });
                throw error;
            }
        });
    },
);
