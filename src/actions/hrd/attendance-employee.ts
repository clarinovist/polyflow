'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { AttendanceService } from '@/services/hrd/attendance-service';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { logger } from '@/lib/config/logger';

export const listAttendanceByEmployee = withTenant(
  async function listAttendanceByEmployee(employeeId: string, from?: string, to?: string) {
    return safeAction(async () => {
      try {
        await requireHrdFinance();
        const fromDate = from ? new Date(from) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
        const toDate = to ? new Date(to) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0));
        return await AttendanceService.listByEmployee(prisma, employeeId, fromDate, toDate);
      } catch (error) {
        logger.error('Failed to list attendance by employee', { error, employeeId, module: 'AttendanceEmployeeActions' });
        throw error;
      }
    });
  },
);
