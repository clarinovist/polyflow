'use server';

import { withTenant } from '@/lib/core/tenant';
import { TaxService } from '@/services/finance/tax-service';
import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';

export const getTaxSummary = withTenant(async function getTaxSummary(
    startDate: Date,
    endDate: Date,
) {
    return safeAction(async () => {
        await requireFinanceAccess();
        const start = new Date(startDate);
        const end = new Date(endDate);
        const data = await TaxService.getTaxSummary(start, end);
        return serializeData(data);
    });
});
