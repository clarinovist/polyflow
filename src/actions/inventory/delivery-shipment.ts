'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { safeAction, ValidationError } from '@/lib/errors/errors';
import { requireWarehouseResourcePermission } from '@/lib/tools/auth-checks';
import {
    normalizeToBusinessDay,
    parseBusinessDate,
} from '@/lib/utils/timezone';

export const shipDeliveryOrder = withTenant(
    async function shipDeliveryOrder(data: {
        deliveryOrderId: string;
        actualShipmentDate: string;
    }) {
        return safeAction(async () => {
            const session = await requireWarehouseResourcePermission(
                '/warehouse/outgoing',
            );
            if (!data.deliveryOrderId.trim()) {
                throw new ValidationError('Surat Jalan wajib dipilih.');
            }
            try {
                parseBusinessDate(data.actualShipmentDate);
            } catch {
                throw new ValidationError(
                    'Tanggal penyerahan aktual tidak valid.',
                );
            }

            const { commitDeliveryShipment } =
                await import('@/services/sales/delivery-fulfillment-service');
            const shipment = await commitDeliveryShipment(
                data.deliveryOrderId,
                session.user.id,
                {
                    actualShipmentDate: normalizeToBusinessDay(
                        data.actualShipmentDate,
                    ),
                },
            );

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/deliveries/${data.deliveryOrderId}`);
            revalidatePath('/warehouse/outgoing');
            revalidatePath(`/warehouse/outgoing/${data.deliveryOrderId}`);
            revalidatePath('/warehouse/inventory');
            return shipment;
        });
    },
);
