'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { EmployeeLoanService } from '@/services/hrd/payroll-monthly-service';
import { todayWibDateString } from '@/services/hrd/shift-window';

export const getHrdDashboardKpis = withTenant(
  async function getHrdDashboardKpis() {
    return safeAction(async () => {
      await requireHrdFinance();
      const today = todayWibDateString();

      const [summary, leavePending, loanPort, openPeriods, bpjsCount, hrAlertsUnread] =
        await Promise.all([
          AttendanceService.getSummary(prisma, new Date(today)).catch(() => null),
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
        ]);

      return {
        presentToday: summary?.totalEmployees ?? 0,
        leavePending,
        loanOutstanding: loanPort.sumRemainingActive,
        loanActiveCount: loanPort.activeCount,
        openPayrollPeriods: openPeriods,
        bpjsParticipants: bpjsCount,
        hrAlertsUnread,
        today,
      };
    });
  },
);
