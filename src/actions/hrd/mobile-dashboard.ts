'use server';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import {
    safeAction,
    BusinessRuleError,
} from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import {
    parseBusinessDate,
    toBusinessDateString,
} from '@/lib/utils/timezone';
import { hasAnyRole } from '@/lib/auth/roles';

export interface MobileHrdOverview {
    generatedAt: string;
    highlights: {
        presentTodayCount: number;
        pendingLeaveCount: number;
        attendanceAlertsCount: number;
        absentYesterdayCount: number;
        openPayrollPeriodName?: string;
    };
    pendingLeaves: Array<{
        id: string;
        employeeName: string;
        leaveType: string;
        startDate: string;
        endDate: string;
        status: string;
    }>;
}

export const getHrdMobileOverview = withTenant(
    async function getHrdMobileOverview() {
        return safeAction(async () => {
            await requireAuth();

            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            const [presentToday, pendingLeaves, openPeriod] = await Promise.all([
                prisma.attendanceRecord
                    ? prisma.attendanceRecord.count({
                          where: { workDate: { gte: todayStart } },
                      }).catch(() => 0)
                    : Promise.resolve(0),
                prisma.leaveRequest
                    ? prisma.leaveRequest.findMany({
                          where: { status: 'PENDING' },
                          take: 10,
                          orderBy: { createdAt: 'desc' },
                          include: { employee: { select: { name: true } } },
                      }).catch(() => [])
                    : Promise.resolve([]),
                prisma.payrollPeriod
                    ? prisma.payrollPeriod.findFirst({
                          where: { status: 'OPEN' },
                          select: { month: true, year: true },
                      }).catch(() => null)
                    : Promise.resolve(null),
            ]);

            const periodName = openPeriod
                ? `Periode ${openPeriod.month}/${openPeriod.year}`
                : undefined;

            const overview: MobileHrdOverview = {
                generatedAt: new Date().toISOString(),
                highlights: {
                    presentTodayCount: presentToday,
                    pendingLeaveCount: pendingLeaves.length,
                    attendanceAlertsCount: 0,
                    absentYesterdayCount: 0,
                    openPayrollPeriodName: periodName,
                },
                pendingLeaves: pendingLeaves.map((l: { id: string; employee?: { name: string } | null; leaveType?: string | null; startDate: Date | null; endDate: Date | null; status: string }) => ({
                    id: l.id,
                    employeeName: l.employee?.name ?? 'Karyawan',
                    leaveType: l.leaveType || 'Cuti',
                    startDate: l.startDate
                        ? new Date(l.startDate).toISOString()
                        : todayStart.toISOString(),
                    endDate: l.endDate
                        ? new Date(l.endDate).toISOString()
                        : todayStart.toISOString(),
                    status: l.status,
                })),
            };

            return serializeData(overview);
        });
    },
);

export interface HrdMobileTeamAttendanceFilters {
    date: string;
    workShiftId?: string;
    status?: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'ALL';
    q?: string;
}

export interface HrdMobileTeamAttendanceRecord {
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
    totalEmployees: number;
    presentCount: number;
    absentCount: number;
    onLeaveCount: number;
    noRecordCount: number;
    records: HrdMobileTeamAttendanceRecord[];
    shifts: Array<{ id: string; name: string }>;
}

export const getHrdMobileTeamAttendance = withTenant(
    async function getHrdMobileTeamAttendance(
        filters?: HrdMobileTeamAttendanceFilters,
    ) {
        return safeAction(async () => {
            const session = await requireAuth();
            const hasAccess =
                hasAnyRole(session.user, ['HRD', 'ADMIN']) ||
                !!(session.user as { isSuperAdmin?: boolean }).isSuperAdmin;
            if (!hasAccess) {
                throw new BusinessRuleError(
                    'Hanya HRD atau admin yang dapat melihat rekap absensi tim.',
                );
            }

            const rawDate = filters?.date?.trim() || toBusinessDateString(new Date());
            const businessDate = parseBusinessDate(rawDate);
            const workDate = new Date(`${businessDate}T00:00:00.000Z`);

            const [employees, attendanceRecords, shifts] = await Promise.all([
                prisma.employee
                    ? prisma.employee.findMany({
                          where: {
                              status: 'ACTIVE',
                              ...(filters?.q?.trim()
                                  ? {
                                        OR: [
                                            { name: { contains: filters.q.trim(), mode: 'insensitive' as const } },
                                            { code: { contains: filters.q.trim(), mode: 'insensitive' as const } },
                                        ],
                                    }
                                  : {}),
                          },
                          select: { id: true, name: true, code: true, role: true },
                          orderBy: { name: 'asc' },
                          take: 300,
                      }).catch(() => [] as any[])
                    : Promise.resolve([] as any[]),
                prisma.attendanceRecord
                    ? prisma.attendanceRecord.findMany({
                          where: {
                              workDate,
                              ...(filters?.workShiftId ? { workShiftId: filters.workShiftId } : {}),
                              ...(filters?.status && filters.status !== 'ALL'
                                  ? { status: filters.status as any }
                                  : {}),
                          },
                          include: {
                              employee: { select: { id: true, name: true, code: true, role: true } },
                              workShift: {
                                  select: { id: true, name: true, startTime: true },
                              },
                          },
                          orderBy: [{ clockInAt: 'asc' }],
                      }).catch(() => [] as any[])
                    : Promise.resolve([] as any[]),
                prisma.workShift
                    ? prisma.workShift.findMany({
                          where: { status: 'ACTIVE' },
                          select: { id: true, name: true },
                          orderBy: { startTime: 'asc' },
                      }).catch(() => [] as any[])
                    : Promise.resolve([] as any[]),
            ]);

            const recordByEmp = new Map<string, any>();
            for (const rec of attendanceRecords as Array<any>) {
                if (!recordByEmp.has(rec.employeeId)) {
                    recordByEmp.set(rec.employeeId, rec);
                } else {
                    const prev = recordByEmp.get(rec.employeeId);
                    if (prev.status !== 'PRESENT' && rec.status === 'PRESENT') {
                        recordByEmp.set(rec.employeeId, rec);
                    }
                }
            }

            const employeeMap = new Map<string, { id: string; name: string; code: string; role: string }>();
            for (const e of employees as Array<any>) {
                if (e?.id) employeeMap.set(e.id, { id: e.id, name: e.name, code: e.code, role: e.role });
            }
            const records: HrdMobileTeamAttendanceRecord[] = Array.from(employeeMap.values()).map((emp) => {
                const rec = recordByEmp.get(emp.id);
                if (!rec) {
                    return {
                        id: null,
                        employeeId: emp.id,
                        employeeName: emp.name,
                        employeeCode: emp.code,
                        employeeRole: emp.role,
                        shiftName: null,
                        clockInAt: null,
                        clockOutAt: null,
                        status: 'NO_RECORD',
                        actualHours: null,
                        isLate: null,
                    };
                }

                let isLate: boolean | null = null;
                if (rec.clockInAt && rec.workShift?.startTime) {
                    try {
                        const [sh, sm] = String(rec.workShift.startTime).split(':').map(Number);
                        const shiftStart = sh * 60 + sm;
                        const clockDate = new Date(rec.clockInAt);
                        const wibClock = new Date(clockDate.getTime() + 7 * 3600 * 1000);
                        const clockMin = wibClock.getUTCHours() * 60 + wibClock.getUTCMinutes();
                        isLate = clockMin > shiftStart + 15;
                    } catch {
                        isLate = null;
                    }
                }

                return {
                    id: rec.id ?? null,
                    employeeId: emp.id,
                    employeeName: emp.name,
                    employeeCode: emp.code,
                    employeeRole: emp.role,
                    shiftName: rec.workShift?.name ?? null,
                    clockInAt: rec.clockInAt ? new Date(rec.clockInAt).toISOString() : null,
                    clockOutAt: rec.clockOutAt ? new Date(rec.clockOutAt).toISOString() : null,
                    status: rec.status ?? 'NO_RECORD',
                    actualHours: rec.actualHours != null ? Number(rec.actualHours) : null,
                    isLate,
                };
            });

            let filtered = records;
            if (filters?.status && filters.status !== 'ALL') {
                filtered = records.filter((r) => r.status === filters.status);
            }

            filtered.sort((a, b) => {
                const order: Record<string, number> = { PRESENT: 0, ABSENT: 1, ON_LEAVE: 2, NO_RECORD: 3 };
                const ao = order[a.status] ?? 9;
                const bo = order[b.status] ?? 9;
                if (ao !== bo) return ao - bo;
                return a.employeeName.localeCompare(b.employeeName);
            });

            const result: HrdMobileTeamAttendanceResult = {
                generatedAt: new Date().toISOString(),
                date: businessDate,
                totalEmployees: filtered.length,
                presentCount: filtered.filter((r) => r.status === 'PRESENT').length,
                absentCount: filtered.filter((r) => r.status === 'ABSENT').length,
                onLeaveCount: filtered.filter((r) => r.status === 'ON_LEAVE').length,
                noRecordCount: filtered.filter((r) => r.status === 'NO_RECORD').length,
                records: filtered,
                shifts: (shifts as Array<any>).map((s) => ({ id: s.id, name: s.name })),
            };

            return serializeData(result);
        });
    },
);
