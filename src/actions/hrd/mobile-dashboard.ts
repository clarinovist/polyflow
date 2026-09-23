'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireRole } from '@/lib/tools/auth-checks';
import { parseBusinessDate, toBusinessDateString } from '@/lib/utils/timezone';
import { Prisma } from '@prisma/client';

export const getHrdMobileOverview = withTenant(async function getHrdMobileOverview() {
    return safeAction(async () => {
        // Matches the existing HRD workspace policy; no implicit cross-role reads.
        await requireRole(['HRD', 'ADMIN', 'FINANCE']);
        const workDate = new Date(`${toBusinessDateString(new Date())}T00:00:00.000Z`);
        const [present, pendingLeaveCount, pendingLeaves, openPeriod] = await Promise.all([
            prisma.attendanceRecord.findMany({ where: { workDate, status: 'PRESENT' }, distinct: ['employeeId'], select: { employeeId: true } }),
            prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
            prisma.leaveRequest.findMany({ where: { status: 'PENDING' }, take: 10, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: {
                id: true, type: true, startDate: true, endDate: true, status: true, employee: { select: { name: true } },
            } }),
            prisma.payrollPeriod.findFirst({ where: { status: 'OPEN' }, select: { month: true, year: true }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
        ]);
        return {
            generatedAt: new Date().toISOString(),
            highlights: {
                presentTodayCount: present.length, pendingLeaveCount,
                openPayrollPeriodName: openPeriod ? `Periode ${openPeriod.month}/${openPeriod.year}` : undefined,
            },
            pendingLeaves: pendingLeaves.map((l) => ({
                id: l.id, employeeName: l.employee.name, leaveType: l.type,
                startDate: l.startDate.toISOString(), endDate: l.endDate.toISOString(), status: l.status,
            })),
        };
    });
});

export interface HrdMobileTeamAttendanceFilters {
    date?: string;
    workShiftId?: string;
    status?: 'PRESENT' | 'ABSENT' | 'ON_LEAVE' | 'NO_RECORD' | 'ALL';
    q?: string;
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
    totalEmployees: number;
    presentCount: number;
    absentCount: number;
    onLeaveCount: number;
    noRecordCount: number;
    records: HrdMobileTeamAttendanceRecord[];
    shifts: Array<{ id: string; name: string }>;
}

export const getHrdMobileTeamAttendance = withTenant(async function getHrdMobileTeamAttendance(filters?: HrdMobileTeamAttendanceFilters) {
    return safeAction(async () => {
        await requireRole(['HRD', 'ADMIN']);
        const status = filters?.status || 'ALL';
        if (!['ALL', 'PRESENT', 'ABSENT', 'ON_LEAVE', 'NO_RECORD'].includes(status)) {
            throw new BusinessRuleError('Filter status absensi tidak valid.');
        }
        const businessDate = parseBusinessDate(filters?.date?.trim() || toBusinessDateString(new Date()));
        const workDate = new Date(`${businessDate}T00:00:00.000Z`);
        const employeeWhere: Prisma.EmployeeWhereInput = {
            status: 'ACTIVE',
            ...(filters?.q?.trim() ? { OR: [
                { name: { contains: filters.q.trim(), mode: 'insensitive' } },
                { code: { contains: filters.q.trim(), mode: 'insensitive' } },
            ] } : {}),
        };
        const [employees, attendance, shifts] = await Promise.all([
            prisma.employee.findMany({ where: employeeWhere, select: { id: true, name: true, code: true, role: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
            prisma.attendanceRecord.findMany({
                // Read all statuses before merging. NO_RECORD is a derived state, never a DB enum.
                where: { workDate, employee: employeeWhere, ...(filters?.workShiftId ? { workShiftId: filters.workShiftId } : {}) },
                include: { workShift: { select: { name: true } } },
                orderBy: [{ clockInAt: 'desc' }, { id: 'asc' }],
            }),
            prisma.workShift.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true }, orderBy: { startTime: 'asc' } }),
        ]);
        const byEmployee = new Map<string, (typeof attendance)[number]>();
        for (const record of attendance) {
            const previous = byEmployee.get(record.employeeId);
            if (!previous || (previous.status !== 'PRESENT' && record.status === 'PRESENT')) byEmployee.set(record.employeeId, record);
        }
        const records: HrdMobileTeamAttendanceRecord[] = employees.map((employee): HrdMobileTeamAttendanceRecord => {
            const record = byEmployee.get(employee.id);
            return {
                id: record?.id ?? null, employeeId: employee.id, employeeName: employee.name,
                employeeCode: employee.code, employeeRole: employee.role,
                shiftName: record?.workShift.name ?? null,
                clockInAt: record?.clockInAt?.toISOString() ?? null, clockOutAt: record?.clockOutAt?.toISOString() ?? null,
                status: record?.status ?? 'NO_RECORD', actualHours: record?.actualHours == null ? null : Number(record.actualHours),
                // Don't infer lateness from wall-clock time: overnight shifts need attendance-domain rules.
                isLate: null,
            };
        }).filter((record) => status === 'ALL' || record.status === status);
        const order = { PRESENT: 0, ABSENT: 1, ON_LEAVE: 2, NO_RECORD: 3 };
        records.sort((a, b) => order[a.status] - order[b.status] || a.employeeName.localeCompare(b.employeeName));
        return {
            generatedAt: new Date().toISOString(), date: businessDate, totalEmployees: records.length,
            presentCount: records.filter((r) => r.status === 'PRESENT').length,
            absentCount: records.filter((r) => r.status === 'ABSENT').length,
            onLeaveCount: records.filter((r) => r.status === 'ON_LEAVE').length,
            noRecordCount: records.filter((r) => r.status === 'NO_RECORD').length,
            records, shifts,
        } satisfies HrdMobileTeamAttendanceResult;
    });
});
