/**
 * Delivery photo lifecycle policy — pure, testable, single source of truth.
 *
 * Consumed by the server action (authority) and the UI (visibility mirror),
 * so buttons only appear where the server accepts an upload.
 * These are state-machine invariants, NOT tenant preferences → no AppSetting.
 */

import type { DeliveryStatus } from '@prisma/client';

export type DeliveryPhotoType = 'vehicle' | 'proof_of_delivery';

/** Vehicle photo (truck) can only be attached before/during dispatch. */
export const VEHICLE_PHOTO_STATUS_LIST: readonly DeliveryStatus[] = [
    'PENDING',
    'LOADING',
    'SHIPPED',
];

/** Proof-of-delivery photo can only be attached once the order is on the road. */
export const POD_PHOTO_STATUS_LIST: readonly DeliveryStatus[] = [
    'SHIPPED',
    'IN_TRANSIT',
    'ARRIVED',
    'DELIVERED',
];

export const DELIVERY_PHOTO_STATUS_BY_TYPE: Record<
    DeliveryPhotoType,
    readonly DeliveryStatus[]
> = {
    vehicle: VEHICLE_PHOTO_STATUS_LIST,
    proof_of_delivery: POD_PHOTO_STATUS_LIST,
};

export function getAllowedDeliveryPhotoStatuses(
    photoType: DeliveryPhotoType,
): readonly DeliveryStatus[] {
    return DELIVERY_PHOTO_STATUS_BY_TYPE[photoType];
}

/**
 * Whether a photo of the given type may be attached at the given DO status.
 * `status` is intentionally `string` — the UI carries it as a plain string.
 */
export function canAttachDeliveryPhoto(
    status: string,
    photoType: DeliveryPhotoType,
): boolean {
    return getAllowedDeliveryPhotoStatuses(photoType).includes(
        status as DeliveryStatus,
    );
}

/** Server error copy for an invalid photo lifecycle. */
export function getDeliveryPhotoStatusErrorMessage(
    status: string,
    photoType: DeliveryPhotoType,
): string {
    const allowed = getAllowedDeliveryPhotoStatuses(photoType).join('/');
    const subject =
        photoType === 'vehicle' ? 'Foto truk' : 'Bukti terima';
    return `${subject} hanya bisa diupload saat status ${allowed}. Status saat ini: ${status}`;
}
