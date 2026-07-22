'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { EmployeeLoanService } from '@/services/hrd/payroll-monthly-service';
import { todayWibDateString } from '@/services/hrd/shift-window';

export interface HrdShiftBoard {
  counts: {
    /** Unique employees with PRESENT status today (not total headcount). */
    presentToday: number;
    leavePending: number;
    loanOutstanding: number;
    loanActiveCount: number;
    openPayrollPeriods: number;
    bpjsParticipants: number;
    hrAlertsUnread: number;
    absentYesterday: number;
    periodsNeedGenerate: number;
  };
  attention: {
    pendingLeaves: Array<{
      id: string;
      employeeName: string;
      type: string;
      startDate: string;
      daysPending: number;
    }>;
    hrAlerts: Array<{
      id: string;
      title: string;
      type: string;
      createdAt: string;
    }>;
    openPeriods: Array<{
      id: string;
      label: string;
      status: string;
      needsGenerate: boolean;
    }>;
    absentYesterday: Array<{
      employeeId: string;
      employeeName: string;
      employeeCode: string;
    }>;
  };
  today: string;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const;

export function getMonthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

export function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

/** Pure mapper — unit-tested without DB. */
export function mapHrdShiftBoard(input: {
  today: string;
  presentToday: number;
  leavePendingCount: number;
  loanOutstanding: number;
  loanActiveCount: number;
  openPeriodsCount: number;
  bpjsCount: number;
  hrAlertsUnreadCount: number;
  absentYesterdayCount: number;
  pendingLeaves: Array<{
    id: string;
    type: string;
    startDate: Date;
    createdAt: Date;
    employee: { name: string };
  }>;
  hrAlerts: Array<{
    id: string;
    title: string;
    type: string;
    createdAt: Date;
  }>;
  openPeriods: Array<{
    id: string;
    year: number;
    month: number;
    status: string;
    payslipCount: number;
  }>;
  absentYesterday: Array<{
    employeeId: string;
    employee: { name: string; code: string };
  }>;
}): HrdShiftBoard {
  const todayDate = new Date(input.today);
  const periodsNeedGenerate = input.openPeriods.filter((p) => p.payslipCount === 0);

  return {
    counts: {
      presentToday: input.presentToday,
      leavePending: input.leavePendingCount,
      loanOutstanding: input.loanOutstanding,
      loanActiveCount: input.loanActiveCount,
      openPayrollPeriods: input.openPeriodsCount,
      bpjsParticipants: input.bpjsCount,
      hrAlertsUnread: input.hrAlertsUnreadCount,
      absentYesterday: input.absentYesterdayCount,
      periodsNeedGenerate: periodsNeedGenerate.length,
    },
    attention: {
      pendingLeaves: input.pendingLeaves.map((l) => ({
        id: l.id,
        employeeName: l.employee.name,
        type: l.type,
        startDate: l.startDate.toISOString(),
        daysPending: daysBetween(l.createdAt, todayDate),
      })),
      hrAlerts: input.hrAlerts.map((a) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        createdAt: a.createdAt.toISOString(),
      })),
      openPeriods: input.openPeriods.map((p) => ({
        id: p.id,
        label: `${getMonthName(p.month)} ${p.year}`,
        status: p.status,
        needsGenerate: p.payslipCount === 0,
      })),
      absentYesterday: input.absentYesterday.map((r) => ({
        employeeId: r.employeeId,
        employeeName: r.employee.name,
        employeeCode: r.employee.code,
      })),
    },
    today: input.today,
  };
}

export const getHrdShiftBoard = withTenant(
  async function getHrdShiftBoard() {
    return safeAction(async () => {
      await requireHrdFinance();
      const today = todayWibDateString();
      const todayDate = new Date(today);
      const yesterdayDate = new Date(todayDate);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);

      const [
        summary,
        leavePendingCount,
        loanPort,
        openPeriodsCount,
        bpjsCount,
        hrAlertsUnreadCount,
        pendingLeaves,
        hrAlerts,
        openPeriods,
        absentYesterdayCount,
        absentYesterdayRecords,
      ] = await Promise.all([
        AttendanceService.getSummary(prisma, todayDate).catch(() => null),
        prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
        EmployeeLoanService.getPortfolioSummary(prisma),
        prisma.payrollPeriod.count({ where: { status: 'OPEN' } }),
        prisma.employee.count({
          where: { bpjsParticipant: true, status: 'ACTIVE' },
        }),
        prisma.notification.count({
          where: {
            type: { in: ['HRD_PROBATION_ENDING', 'HRD_CONTRACT_EXPIRING'] },
            isRead: false,
          },
        }),
        prisma.leaveRequest.findMany({
          where: { status: 'PENDING' },
          select: {
            id: true,
            type: true,
            startDate: true,
            createdAt: true,
            employee: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 5,
        }),
        prisma.notification.findMany({
          where: {
            type: { in: ['HRD_PROBATION_ENDING', 'HRD_CONTRACT_EXPIRING'] },
            isRead: false,
          },
          select: {
            id: true,
            title: true,
            type: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 5,
        }),
        prisma.payrollPeriod.findMany({
          where: { status: 'OPEN' },
          select: {
            id: true,
            year: true,
            month: true,
            status: true,
            _count: { select: { payslips: true } },
          },
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        }),
        prisma.attendanceRecord.groupBy({
          by: ['employeeId'],
          where: { workDate: yesterdayDate, status: 'ABSENT' },
        }).then((rows) => rows.length).catch(() => 0),
        prisma.attendanceRecord.findMany({
          where: {
            workDate: yesterdayDate,
            status: 'ABSENT',
          },
          select: {
            employeeId: true,
            employee: { select: { name: true, code: true } },
          },
          distinct: ['employeeId'],
          take: 5,
        }),
      ]);

      // presentToday = unique PRESENT employees (AttendanceService.getSummary.totalEmployees)
      return mapHrdShiftBoard({
        today,
        presentToday: summary?.totalEmployees ?? 0,
        leavePendingCount,
        loanOutstanding: loanPort.sumRemainingActive,
        loanActiveCount: loanPort.activeCount,
        openPeriodsCount,
        bpjsCount,
        hrAlertsUnreadCount,
        absentYesterdayCount,
        pendingLeaves,
        hrAlerts,
        openPeriods: openPeriods.map((p) => ({
          id: p.id,
          year: p.year,
          month: p.month,
          status: p.status,
          payslipCount: p._count.payslips,
        })),
        absentYesterday: absentYesterdayRecords,
      });
    });
  },
);

export const getHrdDashboardKpis = getHrdShiftBoard;
