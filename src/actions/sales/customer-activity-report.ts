'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { getFieldSalesScope } from '@/services/sales/field-scope';
import { getCustomerActivityReport } from '@/services/sales/customer-activity-service';

export const getSalesCustomerActivityReport = withTenant(
    async function getSalesCustomerActivityReport(
        startDate?: Date,
        endDate?: Date,
        dormantThresholdDays?: number,
    ) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            const scope = getFieldSalesScope(session);
            const data = await getCustomerActivityReport(
                scope,
                startDate,
                endDate,
                dormantThresholdDays,
            );
            return serializeData(data);
        });
    },
);
