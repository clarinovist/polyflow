/**
 * Status keterangan per item Sales Order (derived, read-only).
 *
 * Bukan field yang bisa diedit — dihitung dari:
 * - status header SO,
 * - quantity vs deliveredQty per item,
 * - agregat returnedQty dari dokumen SalesReturn (non-CANCELLED).
 *
 * Retur tetap dicatat sebagai dokumen SalesReturn terpisah; helper ini
 * hanya membaca agregatnya untuk keterangan tampilan.
 */

import type { SalesOrderStatus } from '@prisma/client';
import { isPreConfirm } from './order-phase';

export type OrderItemStatusKey =
    | 'draft'
    | 'cancelled'
    | 'in_production'
    | 'partial'
    | 'delivered'
    | 'returned_partial'
    | 'returned_full';

export interface OrderItemStatusInput {
    orderStatus: SalesOrderStatus;
    quantity: number;
    deliveredQty: number;
    /** Agregat returnedQty dari SalesReturn non-CANCELLED untuk varian ini. */
    returnedQty?: number | null;
}

export interface OrderItemStatus {
    key: OrderItemStatusKey;
    label: string;
    /** Qty retur yang diakui (dibatasi 0..deliveredQty untuk tampilan). */
    returnedQty: number;
}

export const ORDER_ITEM_STATUS_LABELS: Record<OrderItemStatusKey, string> = {
    draft: 'Draft',
    cancelled: 'Dibatalkan',
    in_production: 'Dalam produksi',
    partial: 'Terkirim sebagian',
    delivered: 'Terkirim',
    returned_partial: 'Retur sebagian',
    returned_full: 'Retur',
};

function toFiniteNumber(value: unknown): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Hitung status keterangan satu item SO.
 * Prioritas retur di atas status kirim: bila ada returnedQty yang diakui,
 * kuncinya menjadi returned_full / returned_partial.
 */
export function getOrderItemStatus(input: OrderItemStatusInput): OrderItemStatus {
    const quantity = toFiniteNumber(input.quantity);
    const delivered = Math.max(0, toFiniteNumber(input.deliveredQty));
    const returnedRaw = Math.max(0, toFiniteNumber(input.returnedQty));
    // Retur tidak bisa melebihi yang terkirim — batasi untuk tampilan.
    const returnedQty = Math.min(returnedRaw, delivered);

    if (input.orderStatus === 'CANCELLED') {
        return { key: 'cancelled', label: ORDER_ITEM_STATUS_LABELS.cancelled, returnedQty };
    }

    if (returnedQty >= delivered && delivered > 0) {
        return { key: 'returned_full', label: ORDER_ITEM_STATUS_LABELS.returned_full, returnedQty };
    }
    if (returnedQty > 0) {
        return { key: 'returned_partial', label: ORDER_ITEM_STATUS_LABELS.returned_partial, returnedQty };
    }

    if (isPreConfirm(input.orderStatus)) {
        return { key: 'draft', label: ORDER_ITEM_STATUS_LABELS.draft, returnedQty };
    }

    if (delivered <= 0) {
        return { key: 'in_production', label: ORDER_ITEM_STATUS_LABELS.in_production, returnedQty };
    }
    if (delivered < quantity) {
        return { key: 'partial', label: ORDER_ITEM_STATUS_LABELS.partial, returnedQty };
    }
    return { key: 'delivered', label: ORDER_ITEM_STATUS_LABELS.delivered, returnedQty };
}

/**
 * Agregat returnedQty per productVariantId dari salesReturns
 * yang terbawa pada payload SO detail. Retur CANCELLED diabaikan.
 */
export function aggregateReturnedQtyByVariant(
    salesReturns:
        | ReadonlyArray<{
              status?: string | null;
              items?: ReadonlyArray<{
                  productVariantId?: string | null;
                  returnedQty?: number | string | null;
              }> | null;
          }> | null
        | undefined,
): Map<string, number> {
    const map = new Map<string, number>();
    for (const ret of salesReturns ?? []) {
        if (ret?.status === 'CANCELLED') continue;
        for (const item of ret?.items ?? []) {
            const variantId = item?.productVariantId;
            if (!variantId) continue;
            const qty = toFiniteNumber(item?.returnedQty);
            if (qty <= 0) continue;
            map.set(variantId, (map.get(variantId) ?? 0) + qty);
        }
    }
    return map;
}
