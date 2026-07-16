'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { PayrollService } from '@/services/hrd/payroll-service';
import { startOfWeek, endOfWeek } from '@/services/hrd/week-range';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { logger } from '@/lib/config/logger';

export const getEmployeeWeeklyPayroll = withTenant(
  async function getEmployeeWeeklyPayroll(employeeId: string, dateInWeek?: Date) {
    return safeAction(async () => {
      try {
        const baseDate = dateInWeek ? new Date(dateInWeek) : new Date();
        const weekStart = startOfWeek(baseDate);
        const weekEnd = endOfWeek(baseDate);
        return await PayrollService.getWeeklyPayroll(prisma, employeeId, weekStart, weekEnd);
      } catch (error) {
        logger.error('Failed to get weekly payroll', { error, employeeId, module: 'PayrollActions' });
        if (error instanceof BusinessRuleError) throw error;
        throw new BusinessRuleError('Gagal memuat perhitungan gaji mingguan');
      }
    });
  },
);

export const getAllWeeklyPayroll = withTenant(
  async function getAllWeeklyPayroll(dateInWeek?: string) {
    return safeAction(async () => {
      try {
        const baseDate = dateInWeek ? new Date(dateInWeek) : new Date();
        const weekStart = startOfWeek(baseDate);
        const weekEnd = endOfWeek(baseDate);
        return await PayrollService.getWeeklyPayrollForAll(prisma, weekStart, weekEnd);
      } catch (error) {
        logger.error('Failed to get all weekly payroll', { error, module: 'PayrollActions' });
        throw new BusinessRuleError('Gagal memuat rekap gaji mingguan');
      }
    });
  },
);
