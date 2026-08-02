'use server';

import { withTenant } from '@/lib/core/tenant';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import { requireSalesMarginAccess } from '@/lib/auth/sales-access';
import { getMarginReport } from '@/services/sales/margin-report-service';

export const getSalesMarginReport = withTenant(
    async function getSalesMarginReport(startDate?: Date, endDate?: Date) {
        return safeAction(async () => {
            await requireSalesMarginAccess();
            const data = await getMarginReport(startDate, endDate);
            // hppMap (Map) not JSON-serializable directly — convert to plain array for serializeData
            const serializable = {
                ...data,
                hppMap: Array.from(data.hppMap.entries()).map(
                    ([variantId, entry]) => ({
                        variantId,
                        hppPerUnit: entry.hppPerUnit,
                        totalQuantity: entry.totalQuantity,
                    }),
                ),
            };
            return serializeData(serializable);
        });
    },
);
