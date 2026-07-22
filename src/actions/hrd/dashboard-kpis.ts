'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { EmployeeLoanService } from '@/services/hrd/payroll-monthly-service';
import { todayWibDateString } from '@/services/hrd/shift-window';

import { mapHrdShiftBoard } from './hrd-helpers';

export interface HrdShiftBoard {
  counts: {
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
