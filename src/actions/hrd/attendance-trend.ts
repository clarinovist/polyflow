'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { logger } from '@/lib/config/logger';
import { readAttendanceSettings } from '@/services/hrd/attendance-settings-reader';
import { getLateGraceMinutes } from '@/services/hrd/attendance-location';
import {
    buildAttendanceTrend,
    validateTrendRange,
    type AttendanceTrendResult,
} from '@/services/hrd/attendance-trend';

export const getHrdAttendanceTrend = withTenant(
    async function getHrdAttendanceTrend(input: {
        from: string;
        to: string;
        workShiftId?: string;
    }): Promise<ReturnType<typeof safeAction<AttendanceTrendResult>>> {
        return safeAction(async () => {
            try {
                await requireHrdFinance();
                const { fromDate, toDate } = validateTrendRange(
                    input.from,
                    input.to,
                );
                const workShiftId = input.workShiftId?.trim() || undefined;

                const [records, eligible, settings] = await Promise.all([
                    prisma.attendanceRecord.findMany({
                        where: {
                            workDate: { gte: fromDate, lte: toDate },
                            ...(workShiftId ? { workShiftId } : {}),
                        },
                        select: {
                            employeeId: true,
                            workDate: true,
                            status: true,
                            clockInAt: true,
                            workShift: { select: { startTime: true } },
                        },
                    }),
                    workShiftId
                        ? Promise.resolve([])
                        : prisma.employee.findMany({
                              where: { status: 'ACTIVE' },
                              select: { id: true, joinDate: true },
                          }),
                    readAttendanceSettings(prisma),
                ]);

                return buildAttendanceTrend({
                    from: input.from,
                    to: input.to,
                    workShiftId,
                    records,
                    eligible,
                    graceMinutes: getLateGraceMinutes(settings),
                });
            } catch (error) {
                logger.error('Failed to get HRD attendance trend', {
                    error,
                    from: input.from,
                    to: input.to,
                    workShiftId: input.workShiftId,
                    module: 'AttendanceTrendActions',
                });
                throw error;
            }
        });
    },
);
