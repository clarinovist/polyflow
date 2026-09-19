'use server';

import { z } from 'zod';
import { withTenant } from '@/lib/core/tenant';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { safeAction } from '@/lib/errors/errors';
import { revalidatePath } from 'next/cache';
import {
    getDeliveryRevision,
    reviseDelivery,
    searchRevisionProducts,
} from '@/services/sales/delivery-revision-service';

export const getDeliveryRevisionEditor = withTenant(
    async function getDeliveryRevisionEditor(id: string) {
        return safeAction(async () => {
            await requireSalesAccess();
            return getDeliveryRevision(z.string().min(1).parse(id));
        });
    },
);

export const findDeliveryRevisionProducts = withTenant(
    async function findDeliveryRevisionProducts(search: string) {
        return safeAction(async () => {
            await requireSalesAccess();
            return searchRevisionProducts(
                z
                    .string()
                    .trim()
                    .min(2, 'Ketik minimal 2 karakter')
                    .max(100)
                    .parse(search),
            );
        });
    },
);

export const reviseDeliveryLoad = withTenant(async function reviseDeliveryLoad(
    input: unknown,
) {
    return safeAction(async () => {
        const session = await requireSalesAccess();
        const { deliveryRevisionSchema } =
            await import('@/lib/schemas/delivery-revision');
        const result = await reviseDelivery(
            deliveryRevisionSchema.parse(input),
            session.user.id,
        );
        for (const prefix of [
            '/sales/deliveries',
            '/warehouse/outgoing',
            '/warehouse/mobile/outgoing',
        ]) {
            revalidatePath(prefix);
            revalidatePath(`${prefix}/${result.deliveryOrderId}`);
        }
        for (const prefix of ['/sales/orders', '/field/sales/orders']) {
            revalidatePath(prefix);
            revalidatePath(`${prefix}/${result.salesOrderId}`);
        }
        revalidatePath(`/warehouse/outgoing/orders/${result.salesOrderId}`);
        revalidatePath('/sales/schedules');
        return result;
    });
});
