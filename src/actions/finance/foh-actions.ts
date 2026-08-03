'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import { FOHAllocationService } from '@/services/finance/foh-service';
import { prisma } from '@/lib/core/prisma';

export const getFOHAllocation = withTenant(async function getFOHAllocation(
    year: number,
    month: number,
    accountId: string,
) {
    return safeAction(async () => {
        await requireFinanceAccess();
        const data = await FOHAllocationService.calculateAllocation(
            year,
            month,
            accountId,
        );
        return serializeData(data);
    });
});

export const getExpenseAccounts = withTenant(
    async function getExpenseAccounts() {
        return safeAction(async () => {
            await requireFinanceAccess();
            const accounts = await prisma.account.findMany({
                where: {
                    category: {
                        in: ['OPERATING_EXPENSE', 'OTHER_EXPENSE'],
                    },
                },
                select: { id: true, code: true, name: true },
            });
            return serializeData(accounts);
        });
    },
);
