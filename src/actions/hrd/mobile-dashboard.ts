'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import {
    safeAction,
    BusinessRuleError,
    AuthorizationError,
} from '@/lib/errors/errors';
import { requireRole } from '@/lib/tools/auth-checks';
import { parseBusinessDate, toBusinessDateString } from '@/lib/utils/timezone';
import { Prisma } from '@prisma/client';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';
import { hasRole } from '@/lib/auth/roles';
import { readAttendanceSettings } from '@/services/hrd/attendance-settings-reader';
import { getLateGraceMinutes } from '@/services/hrd/attendance-location';
import { isLateForShift } from '@/services/hrd/shift-window';
import {
    readHrdDashboardHealth,
    readHrdDashboardMobileAggregate,
} from '@/services/hrd/hrd-dashboard-service';
import {
    ATTENDANCE_STATUS_FILTERS,
    type AttendanceStatusFilter,
} from '@/components/hrd/mobile/attendance-filters';

const PAGE_SIZE = 20;
const MAX_PAGE = 10000;
const SUNDAY = 0;
async function requireHrdMobile() {
    const session = await requireRole(['ADMIN', 'HRD']);
    // Tenant admins may read the existing mobile projection, not expand its
    // fields or bypass the tenant/module/portal guard below.
    if (!hasRole(session.user, 'ADMIN') && !hasRole(session.user, 'HRD'))
        throw new AuthorizationError(
            'HRD Mobile hanya tersedia untuk role Admin atau HRD.',
        );
    await requireMobilePortalAccess('hrd-supervisor');
    return session;
}

export const getHrdMobileOverview = withTenant(
    async function getHrdMobileOverview() {
        return safeAction(async () => {
            const session = await requireHrdMobile();
            return readHrdDashboardMobileAggregate(prisma, {
                userId: session.user.id,
            });
        });
    },
);

/** Health + drivers only; skips the attention queries the pages never show. */
export const getHrdMobileHealth = withTenant(
    async function getHrdMobileHealth() {
        return safeAction(async () => {
            await requireHrdMobile();
            return readHrdDashboardHealth(prisma);
        });
    },
);

export interface HrdMobileTeamAttendanceFilters {
    date?: string;
    workShiftId?: string;
    status?: AttendanceStatusFilter;
    q?: string;
    page?: string;
}
interface HrdMobileTeamAttendanceRecord {
    id: string | null;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    employeeRole: string;
    shiftName: string | null;
    clockInAt: string | null;
    clockOutAt: string | null;
    status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'NO_RECORD';
    actualHours: number | null;
    isLate: boolean | null;
}
export interface HrdMobileTeamAttendanceResult {
    generatedAt: string;
    date: string;
    page?: number;
    pageSize?: number;
    pageCount?: number;
    isNonWorkingDay?: boolean;
    totalEmployees: number;
    returned?: number;
    presentCount: number;
    absentCount: number;
    onLeaveCount: number;
    noRecordCount: number;
    lateCount?: number;
    records: HrdMobileTeamAttendanceRecord[];
    shifts: Array<{ id: string; name: string }>;
}

export const getHrdMobileTeamAttendance = withTenant(
    async function getHrdMobileTeamAttendance(
        filters?: HrdMobileTeamAttendanceFilters,
    ) {
        return safeAction(async () => {
            await requireHrdMobile();
            const status = filters?.status || 'ALL';
            if (!ATTENDANCE_STATUS_FILTERS.includes(status))
                throw new BusinessRuleError(
                    'Filter status absensi tidak valid.',
                );
            const businessDate = parseBusinessDate(
                filters?.date?.trim() || toBusinessDateString(new Date()),
            );
            const workDate = new Date(businessDate + 'T00:00:00.000Z');
            const requestedPage = Math.max(
                1,
                Math.min(MAX_PAGE, Number(filters?.page) || 1),
            );
            const employeeWhere: Prisma.EmployeeWhereInput = {
                status: 'ACTIVE',
                ...(filters?.workShiftId
                    ? {
                          shiftAssignments: {
                              some: {
                                  workShiftId: filters.workShiftId,
                                  effectiveFrom: { lte: workDate },
                                  OR: [
                                      { effectiveTo: null },
                                      { effectiveTo: { gte: workDate } },
                                  ],
                              },
                          },
                      }
                    : {}),
                ...(filters?.q?.trim()
                    ? {
                          OR: [
                              {
                                  name: {
                                      contains: filters.q.trim(),
                                      mode: 'insensitive',
                                  },
                              },
                              {
                                  code: {
                                      contains: filters.q.trim(),
                                      mode: 'insensitive',
                                  },
                              },
                          ],
                      }
                    : {}),
            };
            const [employees, attendance, shifts, settings] = await Promise.all(
                [
                    prisma.employee.findMany({
                        where: employeeWhere,
                        select: {
                            id: true,
                            name: true,
                            code: true,
                            role: true,
                        },
                        orderBy: [{ name: 'asc' }, { id: 'asc' }],
                    }),
                    prisma.attendanceRecord.findMany({
                        where: {
                            workDate,
                            employee: employeeWhere,
                            ...(filters?.workShiftId
                                ? { workShiftId: filters.workShiftId }
                                : {}),
                        },
                        include: {
                            workShift: {
                                select: {
                                    name: true,
                                    startTime: true,
                                    endTime: true,
                                },
                            },
                        },
                        orderBy: [{ clockInAt: 'desc' }, { id: 'asc' }],
                    }),
                    prisma.workShift.findMany({
                        where: { status: 'ACTIVE' },
                        select: { id: true, name: true },
                        orderBy: { startTime: 'asc' },
                    }),
                    readAttendanceSettings(prisma),
                ],
            );
            const grace = getLateGraceMinutes(settings);
            const byEmployee = new Map<string, (typeof attendance)[number]>();
            for (const record of attendance) {
                const previous = byEmployee.get(record.employeeId);
                if (
                    !previous ||
                    (previous.status !== 'PRESENT' &&
                        record.status === 'PRESENT')
                )
                    byEmployee.set(record.employeeId, record);
            }
            // Sunday is a day off: nobody is "belum absen"; only real records show.
            const isNonWorkingDay = workDate.getUTCDay() === SUNDAY;
            const allRows: HrdMobileTeamAttendanceRecord[] = employees.map(
                (employee) => {
                    const record = byEmployee.get(employee.id);
                    return {
                        id: record?.id ?? null,
                        employeeId: employee.id,
                        employeeName: employee.name,
                        employeeCode: employee.code,
                        employeeRole: employee.role,
                        shiftName: record?.workShift.name ?? null,
                        clockInAt: record?.clockInAt?.toISOString() ?? null,
                        clockOutAt: record?.clockOutAt?.toISOString() ?? null,
                        status: record?.status ?? 'NO_RECORD',
                        actualHours:
                            record?.actualHours == null
                                ? null
                                : Number(record.actualHours),
                        isLate:
                            record?.status === 'PRESENT' && record.clockInAt
                                ? isLateForShift(
                                      record.clockInAt,
                                      businessDate,
                                      record.workShift.startTime,
                                      grace,
                                  )
                                : null,
                    };
                },
            );
            const all = isNonWorkingDay
                ? allRows.filter((r) => r.status !== 'NO_RECORD')
                : allRows;
            const filtered = all.filter(
                (r) =>
                    status === 'ALL' ||
                    (status === 'LATE' ? r.isLate : r.status === status),
            );
            const order = { PRESENT: 0, ABSENT: 1, ON_LEAVE: 2, NO_RECORD: 3 };
            filtered.sort(
                (a, b) =>
                    order[a.status] - order[b.status] ||
                    a.employeeName.localeCompare(b.employeeName),
            );
            const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
            const page = Math.min(requestedPage, pageCount);
            const start = (page - 1) * PAGE_SIZE;
            const rows = filtered.slice(start, start + PAGE_SIZE);
            // Tiles summarise the whole day; only paging follows the filter.
            const countOf = (predicate: (r: HrdMobileTeamAttendanceRecord) => unknown) =>
                all.filter(predicate).length;
            return {
                generatedAt: new Date().toISOString(),
                date: businessDate,
                page,
                pageSize: PAGE_SIZE,
                pageCount,
                isNonWorkingDay,
                totalEmployees: filtered.length,
                returned: rows.length,
                presentCount: countOf((r) => r.status === 'PRESENT'),
                absentCount: countOf((r) => r.status === 'ABSENT'),
                onLeaveCount: countOf((r) => r.status === 'ON_LEAVE'),
                noRecordCount: countOf((r) => r.status === 'NO_RECORD'),
                lateCount: countOf((r) => r.isLate),
                records: rows,
                shifts,
            } satisfies HrdMobileTeamAttendanceResult;
        });
    },
);
