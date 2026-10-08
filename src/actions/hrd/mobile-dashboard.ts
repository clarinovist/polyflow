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

const PAGE_SIZE = 20;
async function requireHrdMobile() {
    const session = await requireRole(['HRD']);
    if (!hasRole(session.user, 'HRD'))
        throw new AuthorizationError(
            'HRD Mobile hanya tersedia untuk role HRD.',
        );
    await requireMobilePortalAccess('hrd-supervisor');
    return session;
}

export const getHrdMobileOverview = withTenant(
    async function getHrdMobileOverview() {
        return safeAction(async () => {
            const session = await requireHrdMobile();
            const now = new Date();
            const today = toBusinessDateString(now);
            const workDate = new Date(today + 'T00:00:00.000Z');
            const cutoff = new Date(now.getTime() + 30 * 86400000);
            const [
                present,
                pendingLeaveCount,
                pendingLeaves,
                openPeriod,
                alerts,
                reminderCount,
            ] = await Promise.all([
                prisma.attendanceRecord.findMany({
                    where: { workDate, status: 'PRESENT' },
                    distinct: ['employeeId'],
                    select: { employeeId: true },
                }),
                prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
                prisma.leaveRequest.findMany({
                    where: { status: 'PENDING' },
                    take: 10,
                    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
                    select: {
                        id: true,
                        type: true,
                        startDate: true,
                        endDate: true,
                        status: true,
                        employee: { select: { name: true } },
                    },
                }),
                prisma.payrollPeriod.findFirst({
                    where: { status: 'OPEN' },
                    select: {
                        month: true,
                        year: true,
                        status: true,
                        payslips: { select: { status: true } },
                    },
                    orderBy: [{ year: 'desc' }, { month: 'desc' }],
                }),
                prisma.notification.findMany({
                    where: {
                        userId: session.user.id,
                        type: {
                            in: [
                                'HRD_PROBATION_ENDING',
                                'HRD_CONTRACT_EXPIRING',
                            ],
                        },
                        isRead: false,
                    },
                    take: 5,
                    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
                    select: {
                        id: true,
                        title: true,
                        type: true,
                        createdAt: true,
                    },
                }),
                prisma.employee.count({
                    where: {
                        status: 'ACTIVE',
                        employmentStatus: { in: ['PROBATION', 'CONTRACT'] },
                        OR: [
                            { probationEndDate: { lte: cutoff } },
                            { contractEndDate: { lte: cutoff } },
                        ],
                    },
                }),
            ]);
            const payrollCounts = { draft: 0, finalized: 0, paid: 0 };
            for (const slip of openPeriod?.payslips ?? [])
                payrollCounts[
                    slip.status.toLowerCase() as keyof typeof payrollCounts
                ]++;
            return {
                generatedAt: now.toISOString(),
                highlights: {
                    presentTodayCount: present.length,
                    pendingLeaveCount,
                    openPayrollPeriodName: openPeriod
                        ? 'Periode ' + openPeriod.month + '/' + openPeriod.year
                        : undefined,
                    employmentReminderCount: reminderCount,
                    hrAlertCount: alerts.length,
                },
                payrollReadiness: openPeriod
                    ? {
                          year: openPeriod.year,
                          month: openPeriod.month,
                          status: openPeriod.status,
                          total: openPeriod.payslips.length,
                          counts: payrollCounts,
                      }
                    : null,
                alerts: alerts.map((a) => ({
                    id: a.id,
                    title: a.title,
                    type: a.type,
                    createdAt: a.createdAt.toISOString(),
                })),
                pendingLeaves: pendingLeaves.map((l) => ({
                    id: l.id,
                    employeeName: l.employee.name,
                    leaveType: l.type,
                    startDate: l.startDate.toISOString(),
                    endDate: l.endDate.toISOString(),
                    status: l.status,
                })),
            };
        });
    },
);

export interface HrdMobileTeamAttendanceFilters {
    date?: string;
    workShiftId?: string;
    status?: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'NO_RECORD' | 'LATE' | 'ALL';
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
            if (
                ![
                    'ALL',
                    'PRESENT',
                    'ABSENT',
                    'ON_LEAVE',
                    'NO_RECORD',
                    'LATE',
                ].includes(status)
            )
                throw new BusinessRuleError(
                    'Filter status absensi tidak valid.',
                );
            const businessDate = parseBusinessDate(
                filters?.date?.trim() || toBusinessDateString(new Date()),
            );
            const workDate = new Date(businessDate + 'T00:00:00.000Z');
            const page = Math.max(
                1,
                Math.min(10000, Number(filters?.page) || 1),
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
            const all: HrdMobileTeamAttendanceRecord[] = employees.map(
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
            const start = (page - 1) * PAGE_SIZE;
            return {
                generatedAt: new Date().toISOString(),
                date: businessDate,
                page,
                pageSize: PAGE_SIZE,
                totalEmployees: filtered.length,
                returned: filtered.slice(start, start + PAGE_SIZE).length,
                presentCount: filtered.filter((r) => r.status === 'PRESENT')
                    .length,
                absentCount: filtered.filter((r) => r.status === 'ABSENT')
                    .length,
                onLeaveCount: filtered.filter((r) => r.status === 'ON_LEAVE')
                    .length,
                noRecordCount: filtered.filter((r) => r.status === 'NO_RECORD')
                    .length,
                lateCount: filtered.filter((r) => r.isLate).length,
                records: filtered.slice(start, start + PAGE_SIZE),
                shifts,
            } satisfies HrdMobileTeamAttendanceResult;
        });
    },
);
