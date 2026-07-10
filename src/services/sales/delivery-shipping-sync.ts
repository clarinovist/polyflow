/**
 * Sync Sales Order shipping cost from Delivery Order charges.
 * Placeholder — full implementation in Phase 3.1.
 */

import { prisma } from '@/lib/core/prisma';
import { isBillableDeliveryStatus, sumBillableCharges } from '@/lib/sales/delivery-pricing';
import { logActivity } from '@/lib/tools/audit';

const LOCKED_INVOICE_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE'] as const;

export type ShippingSyncResult = {
  shippingCost: number;
  goodsSubtotal: number;
  totalAmount: number;
  synced: boolean;
  reason: 'OK' | 'INVOICE_LOCKED' | 'SO_CANCELLED' | 'NO_CHANGE';
  invoiceUpdated: boolean;
  billableDeliveryCount: number;
};

/**
 * Recompute SO.shippingCost and SO.totalAmount from sum of DO.totalCharge.
 *
 * Rules:
 * - Sum totalCharge of all DOs with status != CANCELLED
 * - goodsSubtotal = SO.totalAmount - old shippingCost
 * - newTotal = goodsSubtotal + newShippingCost
 * - If any invoice is UNPAID/PARTIAL/PAID/OVERDUE → block sync (return INVOICE_LOCKED)
 * - If DRAFT invoices exist → update their totalAmount too
 */
export async function syncSalesOrderShippingFromDeliveries(
  salesOrderId: string,
  opts?: { tx?: any; userId?: string | null },
): Promise<ShippingSyncResult> {
  const db = opts?.tx ?? prisma;

  const so = await db.salesOrder.findUniqueOrThrow({
    where: { id: salesOrderId },
    select: { id: true, status: true, totalAmount: true, shippingCost: true, orderNumber: true },
  });

  if (so.status === 'CANCELLED') {
    return {
      shippingCost: 0,
      goodsSubtotal: Number(so.totalAmount) - Number(so.shippingCost ?? 0),
      totalAmount: Number(so.totalAmount),
      synced: false,
      reason: 'SO_CANCELLED',
      invoiceUpdated: false,
      billableDeliveryCount: 0,
    };
  }

  const dos = await db.deliveryOrder.findMany({
    where: { salesOrderId },
    select: { status: true, totalCharge: true },
  });

  const billableDeliveries = dos.map((d: any) => ({
    status: d.status,
    totalCharge: d.totalCharge != null ? Number(d.totalCharge) : null,
  }));
  const shippingCost = sumBillableCharges(billableDeliveries);
  const billableCount = billableDeliveries.filter((d: any) => isBillableDeliveryStatus(d.status)).length;

  const oldShipping = so.shippingCost != null ? Number(so.shippingCost) : 0;
  const goodsSubtotal = Number(so.totalAmount) - oldShipping;
  const totalAmount = goodsSubtotal + shippingCost;

  // Check invoices
  const invoices = await db.invoice.findMany({
    where: { salesOrderId, status: { not: 'CANCELLED' } },
    select: { id: true, status: true },
  });

  const hasLocked = invoices.some((i: any) =>
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
    };
  }

  // Update SO
  await db.salesOrder.update({
    where: { id: salesOrderId },
    data: {
      shippingCost: shippingCost > 0 ? shippingCost : null,
      totalAmount,
    },
  });

  // Update DRAFT invoices
  let invoiceUpdated = false;
  for (const inv of invoices.filter((i: any) => i.status === 'DRAFT')) {
    await db.invoice.update({
      where: { id: inv.id },
      data: { totalAmount },
    });
    invoiceUpdated = true;
  }

  if (opts?.userId) {
    await logActivity({
      userId: opts.userId,
      action: 'SYNC_SHIPPING_FROM_DELIVERIES',
      entityType: 'SalesOrder',
      entityId: salesOrderId,
      details: `shippingCost=${shippingCost} totalAmount=${totalAmount}`,
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
  };
}
