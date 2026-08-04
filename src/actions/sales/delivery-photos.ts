'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { logActivity } from '@/lib/tools/audit';
import { revalidatePath } from 'next/cache';
import {
    canAttachDeliveryPhoto,
    getDeliveryPhotoStatusErrorMessage,
} from '@/lib/sales/delivery-photo-policy';

/**
 * Attach a photo URL to a delivery order.
 * photoType 'vehicle' → vehiclePhotoUrl (allowed when status ∈ PENDING/LOADING/SHIPPED)
 * photoType 'proof_of_delivery' → proofOfDeliveryUrl + proofOfDeliveryAt + receivedBy
 */
export const attachDeliveryPhoto = withTenant(
    async function attachDeliveryPhoto(data: {
        deliveryOrderId: string;
        photoType: 'vehicle' | 'proof_of_delivery';
        publicUrl: string;
        receivedBy?: string;
    }) {
        return safeAction(async () => {
            const session = await requireSalesAccess();

            const doRecord = await prisma.deliveryOrder.findUnique({
                where: { id: data.deliveryOrderId },
                select: {
                    id: true,
                    status: true,
                    orderNumber: true,
                    salesOrderId: true,
                },
            });
            if (!doRecord)
                throw new BusinessRuleError('Delivery Order tidak ditemukan.');

            if (
                !canAttachDeliveryPhoto(doRecord.status, data.photoType)
            ) {
                throw new BusinessRuleError(
                    getDeliveryPhotoStatusErrorMessage(
                        doRecord.status,
                        data.photoType,
                    ),
                );
            }

            if (data.photoType === 'vehicle') {
                await prisma.deliveryOrder.update({
                    where: { id: data.deliveryOrderId },
                    data: { vehiclePhotoUrl: data.publicUrl },
                });
            } else {
                // proof_of_delivery
                if (!data.receivedBy?.trim()) {
                    throw new BusinessRuleError(
                        'Nama penerima wajib diisi untuk bukti terima.',
                    );
                }

                await prisma.deliveryOrder.update({
                    where: { id: data.deliveryOrderId },
                    data: {
                        proofOfDeliveryUrl: data.publicUrl,
                        proofOfDeliveryAt: new Date(),
                        receivedBy: data.receivedBy.trim(),
                    },
                });
            }

            await logActivity({
                userId: session.user.id,
                action: 'UPLOAD_DELIVERY_PHOTO',
                entityType: 'DeliveryOrder',
                entityId: data.deliveryOrderId,
                details: `Photo ${data.photoType} uploaded for DO ${doRecord.orderNumber}`,
            });

            revalidatePath('/sales/deliveries');
            revalidatePath(`/sales/deliveries/${data.deliveryOrderId}`);

            return { success: true };
        });
    },
);
