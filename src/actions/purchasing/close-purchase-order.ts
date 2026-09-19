'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { requirePurchasingApprover } from '@/lib/auth/purchasing-access';
import { safeAction } from '@/lib/errors/errors';
import { closeOrder } from '@/services/purchasing/close-order-service';

export const closePurchaseOrder = withTenant(async function closePurchaseOrder(
    id: string,
    reason: string,
) {
    return safeAction(async () => {
        const session = await requirePurchasingApprover();
        const result = await closeOrder(id, reason, session.user.id);
        for (const path of [
            '/purchasing',
            '/purchasing/orders',
            `/purchasing/orders/${result.id}`,
            '/warehouse',
            '/warehouse/incoming',
            '/warehouse/mobile',
            '/warehouse/mobile/incoming',
            `/warehouse/incoming/orders/${result.id}`,
        ])
            revalidatePath(path);
        return result;
    });
});
