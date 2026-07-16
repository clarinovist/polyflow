'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { PayrollService } from '@/services/hrd/payroll-service';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { logger } from '@/lib/config/logger';

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export const getEmployeeWeeklyPayroll = withTenant(
  async function getEmployeeWeeklyPayroll(employeeId: string, dateInWeek?: Date) {
    return safeAction(async () => {
      try {
        const baseDate = dateInWeek ? new Date(dateInWeek) : new Date();
        const weekStart = startOfWeek(baseDate);
        const weekEnd = endOfWeek(baseDate);
        const payroll = await PayrollService.getWeeklyPayroll(prisma, employeeId, weekStart, weekEnd);
        return payroll;
      } catch (error) {
        logger.error('Failed to get weekly payroll', { error, employeeId, module: 'PayrollActions' });
        if (error instanceof BusinessRuleError) throw error;
        throw new BusinessRuleError('Gagal memuat perhitungan gaji mingguan');
      }
    });
  }
);
