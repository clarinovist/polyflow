'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { getFieldSalesScope } from '@/services/sales/field-scope';
import { getPipelineData } from '@/services/sales/pipeline-service';

export const getSalesPipeline = withTenant(async function getSalesPipeline(
    startDate?: Date,
    endDate?: Date,
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const scope = getFieldSalesScope(session);
        const data = await getPipelineData(scope, startDate, endDate);
        return serializeData(data);
    });
});
