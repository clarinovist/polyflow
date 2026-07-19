'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireHrdFinance } from '@/lib/auth/hrd-access';
import { listSalaryHistory as listSalaryHistoryService } from '@/lib/hrd/salary-history';

export const listSalaryHistory = withTenant(
    async function listSalaryHistory(employeeId: string) {
        return safeAction(async () => {
            await requireHrdFinance();
            return listSalaryHistoryService(prisma, employeeId);
        });
    },
);
