'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { logActivity } from '@/lib/tools/audit';
import { revalidatePath } from 'next/cache';

const VEHICLE_ALLOWED_STATUSES = ['PENDING', 'LOADING', 'SHIPPED'];
const POD_ALLOWED_STATUSES = ['SHIPPED', 'IN_TRANSIT', 'ARRIVED', 'DELIVERED'];

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
    const session = await requireAuth();

    const doRecord = await prisma.deliveryOrder.findUnique({
      where: { id: data.deliveryOrderId },
      select: { id: true, status: true, orderNumber: true, salesOrderId: true },
    });
    if (!doRecord) throw new BusinessRuleError("Delivery Order tidak ditemukan.");

    if (data.photoType === 'vehicle') {
      if (!VEHICLE_ALLOWED_STATUSES.includes(doRecord.status)) {
        throw new BusinessRuleError(
          `Foto truk hanya bisa diupload saat status ${VEHICLE_ALLOWED_STATUSES.join('/')}. Status saat ini: ${doRecord.status}`,
        );
      }

      await prisma.deliveryOrder.update({
        where: { id: data.deliveryOrderId },
        data: { vehiclePhotoUrl: data.publicUrl },
      });
    } else {
      // proof_of_delivery
      if (!POD_ALLOWED_STATUSES.includes(doRecord.status)) {
        throw new BusinessRuleError(
          `Bukti terima hanya bisa diupload saat status ${POD_ALLOWED_STATUSES.join('/')}. Status saat ini: ${doRecord.status}`,
        );
      }

      if (!data.receivedBy?.trim()) {
        throw new BusinessRuleError("Nama penerima wajib diisi untuk bukti terima.");
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
});
