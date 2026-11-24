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
import {
    joinDateToWibDate,
    periodBounds,
    todayWibDate,
} from '@/services/hrd/payroll-attendance-basis';
import {
    buildDayOutcomes,
    buildEmployeeMonthlyTrend,
} from '@/services/hrd/attendance-day-outcomes';
import {
    NotFoundError,
    ValidationError,
    safeAction,
} from '@/lib/errors/errors';
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

function assertValidEmployeeId(employeeId: string): void {
    if (!employeeId || !employeeId.trim()) {
        throw new ValidationError('ID karyawan wajib diisi');
    }
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

export const getEmployeeAttendanceCalendar = withTenant(
    async function getEmployeeAttendanceCalendar(
        employeeId: string,
        year: number,
        month: number,
    ) {
        return safeAction(async () => {
            try {
                await requireHrdFinance();
                assertValidEmployeeId(employeeId);
                if (!Number.isInteger(year) || year < 2000 || year > 2100) {
                    throw new ValidationError('Tahun tidak valid');
                }
                if (!Number.isInteger(month) || month < 1 || month > 12) {
                    throw new ValidationError('Bulan tidak valid');
                }

                const employee = await prisma.employee.findUnique({
                    where: { id: employeeId },
                    select: { id: true, status: true, joinDate: true },
                });
                if (!employee) {
                    throw new NotFoundError('Karyawan tidak ditemukan');
                }

                const bounds = periodBounds(year, month);
                const [records, leaves] = await Promise.all([
                    AttendanceService.listByEmployee(
                        prisma,
                        employeeId,
                        bounds.periodStart,
                        bounds.periodEnd,
                    ),
                    prisma.leaveRequest.findMany({
                        where: {
                            employeeId,
                            status: 'APPROVED',
                            startDate: { lte: bounds.periodEnd },
                            endDate: { gte: bounds.periodStart },
                        },
                        select: { type: true, startDate: true, endDate: true },
                    }),
                ]);

                const flaggedRecords = await attachFlags(records);
                const { days, summary } = buildDayOutcomes({
                    ...bounds,
                    today: todayWibDate(),
                    joinDate: joinDateToWibDate(employee.joinDate),
                    records: flaggedRecords.map((r) => ({
                        workDate: new Date(r.workDate),
                        status: r.status as 'PRESENT' | 'ABSENT' | 'ON_LEAVE',
                        clockInAt: r.clockInAt ? new Date(r.clockInAt) : null,
                        isLate: r.isLate,
                    })),
                    leaves,
                });

                return {
                    year,
                    month,
                    employeeStatus: employee.status,
                    records: flaggedRecords,
                    days,
                    summary,
                };
            } catch (error) {
                logger.error('Failed to get employee attendance calendar', {
                    error,
                    employeeId,
                    year,
                    month,
                    module: 'AttendanceEmployeeActions',
                });
                throw error;
            }
        });
    },
);

export const getEmployeeAttendanceTrend = withTenant(
    async function getEmployeeAttendanceTrend(
        employeeId: string,
        months = 6,
    ) {
        return safeAction(async () => {
            try {
                await requireHrdFinance();
                assertValidEmployeeId(employeeId);
                if (!Number.isInteger(months) || months < 1 || months > 12) {
                    throw new ValidationError('Jumlah bulan harus antara 1 dan 12');
                }

                const employee = await prisma.employee.findUnique({
                    where: { id: employeeId },
                    select: { id: true, status: true, joinDate: true },
                });
                if (!employee) {
                    throw new NotFoundError('Karyawan tidak ditemukan');
                }

                const today = todayWibDate();
                const endYear = today.getUTCFullYear();
                const endMonth = today.getUTCMonth() + 1;
                const rangeStart = new Date(
                    Date.UTC(endYear, endMonth - months, 1),
                );
                const { periodEnd: rangeEnd } = periodBounds(endYear, endMonth);

                const [records, leaves] = await Promise.all([
                    prisma.attendanceRecord.findMany({
                        where: {
                            employeeId,
                            workDate: { gte: rangeStart, lte: rangeEnd },
                        },
                        select: {
                            workDate: true,
                            status: true,
                            clockInAt: true,
                            workShiftId: true,
                        },
                    }),
                    prisma.leaveRequest.findMany({
                        where: {
                            employeeId,
                            status: 'APPROVED',
                            startDate: { lte: rangeEnd },
                            endDate: { gte: rangeStart },
                        },
                        select: { type: true, startDate: true, endDate: true },
                    }),
                ]);

                let shiftStartTimes: Map<string, string> | undefined;
                let graceMinutes = 0;
                if (records.length > 0) {
                    const shiftIds = Array.from(
                        new Set(records.map((r) => r.workShiftId)),
                    );
                    const [settings, shifts] = await Promise.all([
                        readAttendanceSettings(prisma),
                        prisma.workShift.findMany({
                            where: { id: { in: shiftIds } },
                            select: { id: true, startTime: true },
                        }),
                    ]);
                    shiftStartTimes = new Map(
                        shifts.map((s) => [s.id, s.startTime]),
                    );
                    graceMinutes = getLateGraceMinutes(settings);
                }

                const points = buildEmployeeMonthlyTrend({
                    endYear,
                    endMonth,
                    months,
                    today,
                    joinDate: joinDateToWibDate(employee.joinDate),
                    records,
                    leaves,
                    shiftStartTimes,
                    graceMinutes,
                });

                return {
                    employeeStatus: employee.status,
                    points,
                };
            } catch (error) {
                logger.error('Failed to get employee attendance trend', {
                    error,
                    employeeId,
                    months,
                    module: 'AttendanceEmployeeActions',
                });
                throw error;
            }
        });
    },
);
