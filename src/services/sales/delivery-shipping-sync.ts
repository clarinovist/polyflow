/**
 * Sync Sales Order shipping cost from Delivery Order charges.
 * Computes Σ totalCharge of billable DOs → SO.shippingCost + goods from delivered qty.
 * NOTE: Invoicing is source-of-truth for billed amount (delivered-based). This module
 * only syncs SO shippingCost + SO.totalAmount display, and intentionally does NOT
 * overwrite DRAFT invoice total if deliveredQty > 0 (let invoice-lifecycle own the calc).
 * This avoids race where ordered-based goodsSubtotal would overwrite delivered-based invoice.
 */

import { prisma } from '@/lib/core/prisma';
import { Prisma } from '@prisma/client';
import {
    isBillableDeliveryStatus,
    sumBillableCharges,
} from '@/lib/sales/delivery-pricing';
import { logActivity } from '@/lib/tools/audit';

const LOCKED_INVOICE_STATUSES = [
    'UNPAID',
    'PARTIAL',
    'PAID',
    'OVERDUE',
] as const;

export type ShippingSyncResult = {
    shippingCost: number;
    goodsSubtotal: number;
    totalAmount: number;
    synced: boolean;
    reason: 'OK' | 'INVOICE_LOCKED' | 'SO_CANCELLED' | 'NO_CHANGE';
    invoiceUpdated: boolean;
    billableDeliveryCount: number;
    goodsBasis: 'ORDERED' | 'DELIVERED';
};

/**
 * Recompute SO.shippingCost and SO.totalAmount from sum of DO.totalCharge.
 *
 * Rules:
 * - Sum totalCharge of all DOs with status != CANCELLED (or SHIPPED/DELIVERED for invoice)
 * - If deliveredQty > 0: goodsSubtotal from delivered-based helper, not SO.totalAmount - oldShipping
 *   (prevents race overwriting delivered-based invoice)
 * - If any invoice is UNPAID/PARTIAL/PAID/OVERDUE → block sync (return INVOICE_LOCKED)
 * - If DRAFT invoices exist AND goods basis is ORDERED (no delivery yet): update their totalAmount too
 *   If delivered basis: do NOT overwrite DRAFT invoice (invoice-lifecycle is source of truth)
 */
export async function syncSalesOrderShippingFromDeliveries(
    salesOrderId: string,
    opts?: { tx?: Prisma.TransactionClient; userId?: string | null },
): Promise<ShippingSyncResult> {
    const db = opts?.tx ?? prisma;

    const so = await db.salesOrder.findUniqueOrThrow({
        where: { id: salesOrderId },
        select: {
            id: true,
            status: true,
            totalAmount: true,
            shippingCost: true,
            orderNumber: true,
        },
    });

    if (so.status === 'CANCELLED') {
        return {
            shippingCost: 0,
            goodsSubtotal:
                Number(so.totalAmount) - Number(so.shippingCost ?? 0),
            totalAmount: Number(so.totalAmount),
            synced: false,
            reason: 'SO_CANCELLED',
            invoiceUpdated: false,
            billableDeliveryCount: 0,
            goodsBasis: 'ORDERED',
        };
    }

    const dos = await db.deliveryOrder.findMany({
        where: { salesOrderId },
        select: { status: true, totalCharge: true },
    });

    const billableDeliveries = dos.map((d) => ({
        status: d.status,
        totalCharge: d.totalCharge != null ? Number(d.totalCharge) : null,
    }));
    const shippingCost = sumBillableCharges(billableDeliveries);
    const billableCount = billableDeliveries.filter((d) =>
        isBillableDeliveryStatus(d.status),
    ).length;

    const oldShipping = so.shippingCost != null ? Number(so.shippingCost) : 0;

    // Try delivered-based goodsSubtotal via invoice-lifecycle helper when tx not present.
    // Inside tx we cannot call helper that uses prisma directly (different client), fallback to ordered.
    let goodsSubtotal: number;
    let goodsBasis: 'ORDERED' | 'DELIVERED' = 'ORDERED';

    if (!opts?.tx) {
        try {
            // ponytail: dynamic import left for future direct use of helper
            // const { calculateSalesInvoiceTotalFromDelivered } = await import('@/services/finance/invoice-lifecycle-service');
            // delivered total = goods(delivered) + shippingFromHelper
            // We need goods-only, so compute raw goods then subtract shipping already included?
            // Instead, fetch items delivered directly and compute only goods part via a lightweight query.
            // For now call a tiny local helper to avoid another full SO load with Decimal weirdness:
            const soWithItems = await db.salesOrder.findUnique({
                where: { id: salesOrderId },
                select: {
                    items: {
                        select: {
                            quantity: true,
                            unitPrice: true,
                            discountPercent: true,
                            taxPercent: true,
                            ppnMode: true,
                            deliveredQty: true,
                        },
                    },
                },
            });
            if (
                soWithItems &&
                soWithItems.items.some(
                    (i: { deliveredQty: { toNumber(): number } | number }) => {
                        const v = (
                            i as {
                                deliveredQty: { toNumber(): number } | number;
                            }
                        ).deliveredQty;
                        const n =
                            typeof (v as { toNumber?: () => number })
                                ?.toNumber === 'function'
                                ? (v as { toNumber: () => number }).toNumber()
                                : Number(v);
                        return n > 0;
                    },
                )
            ) {
                // Delivered exists: compute goods subtotal from delivered qty via helper minus its shipping part.
                // Simplest: compute goods from delivered qty using the same logic as lifecycle but without DO shipping.
                const { calculatePpn } = await import('@/lib/utils/ppn');
                type PpnMode = 'INCLUDE' | 'EXCLUDE';
                let goods = 0;
                for (const it of soWithItems.items as Array<
                    Record<string, unknown>
                >) {
                    const deliveredRaw = (it as { deliveredQty?: unknown })
                        .deliveredQty as
                        | { toNumber?: () => number }
                        | number
                        | null
                        | undefined;
                    let delivered = 0;
                    if (deliveredRaw != null) {
                        delivered =
                            typeof (deliveredRaw as { toNumber?: unknown })
                                .toNumber === 'function'
                                ? (
                                      deliveredRaw as { toNumber: () => number }
                                  ).toNumber()
                                : Number(deliveredRaw);
                    }
                    const unitRaw = (it as { unitPrice?: unknown })
                        .unitPrice as
                        | { toNumber?: () => number }
                        | number
                        | null
                        | undefined;
                    let unit = 0;
                    if (unitRaw != null) {
                        unit =
                            typeof (unitRaw as { toNumber?: unknown })
                                .toNumber === 'function'
                                ? (
                                      unitRaw as { toNumber: () => number }
                                  ).toNumber()
                                : Number(unitRaw);
                    }
                    const discRaw = (it as { discountPercent?: unknown })
                        .discountPercent as
                        | { toNumber?: () => number }
                        | number
                        | null
                        | undefined;
                    let discPct = 0;
                    if (discRaw != null) {
                        discPct =
                            typeof (discRaw as { toNumber?: unknown })
                                .toNumber === 'function'
                                ? (
                                      discRaw as { toNumber: () => number }
                                  ).toNumber()
                                : Number(discRaw);
                    }
                    const taxRaw = (it as { taxPercent?: unknown })
                        .taxPercent as
                        | { toNumber?: () => number }
                        | number
                        | null
                        | undefined;
                    let taxPct = 0;
                    if (taxRaw != null) {
                        taxPct =
                            typeof (taxRaw as { toNumber?: unknown })
                                .toNumber === 'function'
                                ? (
                                      taxRaw as { toNumber: () => number }
                                  ).toNumber()
                                : Number(taxRaw);
                    }
                    const raw = delivered * unit;
                    const discount = raw * (discPct / 100);
                    const afterDiscount = raw - discount;
                    const ppnRes = calculatePpn(
                        afterDiscount,
                        taxPct,
                        (it as { ppnMode: string }).ppnMode as PpnMode,
                    );
                    goods += ppnRes.total;
                }
                goodsSubtotal = Math.round(goods * 100) / 100;
                goodsBasis = 'DELIVERED';
                // totalAmount = delivered goods + new shipping
            } else {
                goodsSubtotal = Number(so.totalAmount) - oldShipping;
            }
        } catch {
            goodsSubtotal = Number(so.totalAmount) - oldShipping;
        }
    } else {
        // Inside transaction path: use ordered fallback (caller usually before commit, no delivery yet or locked invoice path)
        goodsSubtotal = Number(so.totalAmount) - oldShipping;
    }

    const totalAmount = goodsSubtotal + shippingCost;

    // Check invoices
    const invoices = await db.invoice.findMany({
        where: { salesOrderId, status: { not: 'CANCELLED' } },
        select: { id: true, status: true },
    });

    const hasLocked = invoices.some((i) =>
        (LOCKED_INVOICE_STATUSES as readonly string[]).includes(i.status),
    );
    if (hasLocked) {
        return {
            shippingCost,
            goodsSubtotal,
            totalAmount,
            synced: false,
            reason: 'INVOICE_LOCKED',
            invoiceUpdated: false,
            billableDeliveryCount: billableCount,
            goodsBasis,
        };
    }

    // Update SO display totals (shipping + totalAmount)
    await db.salesOrder.update({
        where: { id: salesOrderId },
        data: {
            shippingCost: shippingCost > 0 ? shippingCost : null,
            totalAmount,
        },
    });

    // Update DRAFT invoices ONLY when goodsBasis is ORDERED (no delivery yet).
    // When DELIVERED, invoice-lifecycle-service is source of truth; do not overwrite.
    let invoiceUpdated = false;
    if (goodsBasis === 'ORDERED') {
        for (const inv of invoices.filter((i) => i.status === 'DRAFT')) {
            await db.invoice.update({
                where: { id: inv.id },
                data: { totalAmount },
            });
            invoiceUpdated = true;
        }
    }

    if (opts?.userId) {
        await logActivity({
            userId: opts.userId,
            action: 'SYNC_SHIPPING_FROM_DELIVERIES',
            entityType: 'SalesOrder',
            entityId: salesOrderId,
            details: `shippingCost=${shippingCost} totalAmount=${totalAmount} goodsBasis=${goodsBasis}`,
        });
    }

    return {
        shippingCost,
        goodsSubtotal,
        totalAmount,
        synced: true,
        reason: 'OK',
        invoiceUpdated,
        billableDeliveryCount: billableCount,
        goodsBasis,
    };
}
