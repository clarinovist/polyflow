'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { PayrollMonthlyService } from '@/services/hrd/payroll-monthly-service';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { logger } from '@/lib/config/logger';

export const listPayslipsByEmployee = withTenant(
  async function listPayslipsByEmployee(employeeId: string) {
    return safeAction(async () => {
      try {
        await requireHrdFinance();
        return await PayrollMonthlyService.listByEmployee(prisma, employeeId);
      } catch (error) {
        logger.error('Failed to list payslips by employee', { error, employeeId, module: 'PayslipEmployeeActions' });
        throw error;
      }
    });
  },
);

export const listActiveAllowances = withTenant(
  async function listActiveAllowances(employeeId: string) {
    return safeAction(async () => {
      try {
        await requireHrdFinance();
        return await prisma.employeeAllowance.findMany({
          where: { employeeId, isActive: true },
          orderBy: { createdAt: 'asc' },
        });
      } catch (error) {
        logger.error('Failed to list active allowances', { error, employeeId, module: 'PayslipEmployeeActions' });
        throw error;
      }
    });
  },
);
