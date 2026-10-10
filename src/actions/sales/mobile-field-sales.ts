'use server';

import { canViewPrices } from '@/actions/admin/permissions';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { withTenant } from '@/lib/core/tenant';
import { safeAction } from '@/lib/errors/errors';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';
import { serializeData } from '@/lib/utils/utils';
import { readFieldSalesMobileOverview } from '@/services/sales/mobile-field-sales-service';

/** Read-only Field Sales root composer. All six dashboard reads live in the service. */
export const getFieldSalesMobileOverview = withTenant(
    async function getFieldSalesMobileOverview() {
        return safeAction(async () => {
            await requireMobilePortalAccess('sales-field');
            const session = await requireSalesAccess();
            const priceDecision = await canViewPrices();
            const data = await readFieldSalesMobileOverview({
                actor: session,
                canViewPrices:
                    priceDecision.success && priceDecision.data === true,
            });
            return serializeData(data);
        });
    },
);
