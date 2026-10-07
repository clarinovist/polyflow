'use server';

import { canViewPrices } from '@/actions/admin/permissions';
import { requireSalesManager } from '@/lib/auth/sales-access';
import { withTenant } from '@/lib/core/tenant';
import { safeAction } from '@/lib/errors/errors';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';
import { serializeData } from '@/lib/utils/utils';
import { readMarketingMobileOverview } from '@/services/sales/mobile-marketing-service';

/** Read-only beta entry point. There are intentionally no marketing mutations. */
export const getMarketingMobileOverview = withTenant(
    async function getMarketingMobileOverview() {
        return safeAction(async () => {
            await requireMobilePortalAccess('marketing-supervisor');
            await requireSalesManager();

            const priceDecision = await canViewPrices();
            const data = await readMarketingMobileOverview({
                canViewPrices:
                    priceDecision.success && priceDecision.data === true,
            });
            return serializeData(data);
        });
    },
);
