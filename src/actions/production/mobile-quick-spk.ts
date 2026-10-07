'use server';

import { quickCreateProductionOrder } from '@/actions/production/production-orders';
import { withTenant } from '@/lib/core/tenant';
import { safeAction } from '@/lib/errors/errors';
import { requireMobilePortalAccess } from '@/lib/mobile/mobile-portal-access';

export const quickCreateMobileProductionOrder = withTenant(
    async function quickCreateMobileProductionOrder(data: {
        bomId: string;
        plannedQuantity: number;
        machineId: string;
        clientRequestId?: string;
        notes?: string;
        priority?: 'URGENT' | 'NORMAL' | 'LOW';
    }) {
        const access = await safeAction(async () => {
            await requireMobilePortalAccess('production-supervisor');
            return null;
        });
        if (!access.success) return access;
        return quickCreateProductionOrder(data);
    },
);
