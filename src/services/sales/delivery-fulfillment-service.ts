/**
 * Delivery Fulfillment Service
 *
 * Single source of truth for DO lifecycle:
 *   1. createDeliveryOrderFromSalesOrder → document only (PENDING/LOADING)
 *   2. commitDeliveryShipment → stock OUT + SO ship + draft invoice
 *   3. getDeliveryStockReadiness → per-line available vs needed
 *
 * Replaces the coupled logic in fulfillment-service.ts shipOrder
 * and hardens createManualDeliveryOrder.
 */

import { prisma } from "@/lib/core/prisma";
import {
  SalesOrderStatus,
  ProductType,
  ReservationStatus,
  ReservationType,
  MovementType,
  DeliveryStatus,
} from "@prisma/client";
import { logActivity } from "@/lib/tools/audit";
import { InventoryCoreService } from "@/services/inventory/core-service";
import { AccountingService } from "@/services/accounting/accounting-service";
import { InvoiceService } from "@/services/finance/invoice-service";

// =============================================================================
// Types
// =============================================================================

interface CreateDeliveryOrderParams {
  salesOrderId: string;
  sourceLocationId: string;
  userId: string;
  carrier?: string;
  trackingNumber?: string;
  notes?: string;
  vehicleId?: string;
  appliedRateType?: string;
  appliedCostRate?: number;
  appliedChargeRate?: number;
  appliedRouteName?: string;
  totalCost?: number;
  totalCharge?: number;
  estimatedWeightKg?: number;
  destinationAddress?: string;
}

export interface StockReadinessLine {
  productVariantId: string;
  productName: string;
  neededQty: number;
  availableQty: number;
  reservedForThisSo: number;
  shortfall: number;
  isReady: boolean;
}

/** SO statuses that allow DO creation (plan D1). */
const ALLOWED_SO_STATUSES_FOR_DO: SalesOrderStatus[] = [
  SalesOrderStatus.CONFIRMED,
  SalesOrderStatus.IN_PRODUCTION,
  SalesOrderStatus.READY_TO_SHIP,
];

/** DO statuses from which commit is allowed. */
const COMMITTABLE_DO_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.PENDING,
  DeliveryStatus.LOADING,
];

// =============================================================================
// createDeliveryOrderFromSalesOrder
// =============================================================================

/**
 * Create a Delivery Order from a Sales Order.
 * DO status = PENDING (document only, no stock interaction).
 *
 * Rules:
 * - SO must be CONFIRMED | IN_PRODUCTION | READY_TO_SHIP (D1)
 * - Residual qty (quantity - deliveredQty) must be > 0
 * - Only ONE open DO per SO (D6)
 * - SERVICE items skipped (D12)
 */
export async function createDeliveryOrderFromSalesOrder(
  params: CreateDeliveryOrderParams
) {
  const {
    salesOrderId,
    sourceLocationId,
    userId,
    carrier,
    trackingNumber,
    notes,
    vehicleId,
    appliedRateType,
    appliedCostRate,
    appliedChargeRate,
    appliedRouteName,
    totalCost,
    totalCharge,
    estimatedWeightKg,
    destinationAddress,
  } = params;

  // 1. Load SO + items with product type
  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: {
      items: {
        include: {
          productVariant: { include: { product: true } },
        },
      },
    },
  });

  if (!salesOrder) throw new Error("Sales Order not found");

  // 2. Guard SO status (D1)
  if (!ALLOWED_SO_STATUSES_FOR_DO.includes(salesOrder.status)) {
    throw new Error(
      `Tidak bisa membuat SJ dari SO status ${salesOrder.status}. ` +
      `Hanya boleh dari: CONFIRMED, IN_PRODUCTION, READY_TO_SHIP.`
    );
  }

  // 3. Physical lines with residual qty only (D7, D12)
  const residualLines = salesOrder.items
    .filter(
      (item) => item.productVariant.product.productType !== ProductType.SERVICE
    )
    .map((item) => {
      const qty = item.quantity.toNumber();
      const delivered = item.deliveredQty.toNumber();
      const residual = Math.round((qty - delivered) * 10000) / 10000;
      return { item, residual };
    })
    .filter(({ residual }) => residual > 0);

  if (residualLines.length === 0) {
    throw new Error(
      "Tidak ada item fisik tersisa untuk dikirim (semua SERVICE atau residual = 0)."
    );
  }

  // 4. Check no open DO exists for this SO (D6)
  const openDos = await prisma.deliveryOrder.findMany({
    where: {
      salesOrderId,
      status: { in: ["PENDING", "LOADING"] },
    },
    select: { id: true, orderNumber: true, status: true },
  });

  if (openDos.length > 0) {
    throw new Error(
      `Sudah ada Surat Jalan aktif (${openDos[0].orderNumber} status ${openDos[0].status}). ` +
      `Selesaikan atau batalkan SJ yang ada sebelum membuat baru.`
    );
  }

  // 5. Generate DO number
  const lastDo = await prisma.deliveryOrder.findFirst({
    orderBy: { createdAt: "desc" },
  });

  const year = new Date().getFullYear();
  let nextDoNumber = 1;
  if (lastDo?.orderNumber?.startsWith(`DO-${year}-`)) {
    const parts = lastDo.orderNumber.split("-");
    if (parts.length === 3) {
      nextDoNumber = parseInt(parts[2]) + 1;
    }
  }
  const doNumber = `DO-${year}-${nextDoNumber.toString().padStart(4, "0")}`;

  // 6. Create DO with residual physical quantities only
  const deliveryOrder = await prisma.deliveryOrder.create({
    data: {
      orderNumber: doNumber,
      salesOrderId,
      sourceLocationId,
      status: "PENDING",
      deliveryDate: new Date(),
      carrier,
      trackingNumber,
      notes,
      createdById: userId,
      vehicleId: vehicleId || null,
      appliedRateType: (appliedRateType as never) || null,
      appliedCostRate: appliedCostRate ?? null,
      appliedChargeRate: appliedChargeRate ?? null,
      appliedRouteName: appliedRouteName || null,
      totalCost: totalCost ?? null,
      totalCharge: totalCharge ?? null,
      estimatedWeightKg: estimatedWeightKg ?? null,
      destinationAddress: destinationAddress || null,
      items: {
        create: residualLines.map(({ item, residual }) => {
          const factor = item.conversionFactorSnapshot
            ? item.conversionFactorSnapshot.toNumber()
            : null;
          const enteredQty =
            factor && factor > 0
              ? Math.round((residual / factor) * 10000) / 10000
              : residual;
          return {
            productVariantId: item.productVariantId,
            quantity: residual,
            enteredQuantity: enteredQty,
            enteredUnit: item.enteredUnit,
            conversionFactorSnapshot: item.conversionFactorSnapshot,
          };
        }),
      },
    },
  });

  await logActivity({
    userId,
    action: "CREATE_DELIVERY_ORDER",
    entityType: "DeliveryOrder",
    entityId: deliveryOrder.id,
    details: `Delivery Order ${doNumber} created for SO ${salesOrder.orderNumber} (status PENDING — no stock deducted)`,
  });

  return deliveryOrder;
}

// =============================================================================
// commitDeliveryShipment
// =============================================================================

/**
 * Commit a Delivery Order: stock OUT + SO shipped + draft invoice.
 * Called when DO transitions to SHIPPED.
 *
 * Rules:
 * - DO must be PENDING or LOADING
 * - Stock: all-or-nothing per DO line (D10, no negative stock)
 * - SERVICE items skipped (D12)
 * - Consumes ACTIVE reservations for this SO first
 * - After stock success: DO → SHIPPED, deliveredQty++, SO → SHIPPED, invoice DRAFT
 */
export async function commitDeliveryShipment(
  deliveryOrderId: string,
  userId: string,
  opts?: { trackingNumber?: string; carrier?: string }
) {
  return prisma.$transaction(async (tx) => {
    // 1. Load DO + items + SO
    const doRecord = await tx.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
      include: {
        items: true,
        salesOrder: {
          include: {
            items: {
              include: {
                productVariant: { include: { product: true } },
              },
            },
          },
        },
      },
    });

    if (!doRecord) throw new Error("Delivery Order tidak ditemukan.");

    // 2. Guard DO status — only PENDING or LOADING can be committed
    if (!COMMITTABLE_DO_STATUSES.includes(doRecord.status as DeliveryStatus)) {
      throw new Error(
        `Tidak bisa commit DO status ${doRecord.status}. ` +
        `Hanya DO PENDING atau LOADING yang bisa di-commit ke SHIPPED.`
      );
    }

    // 3. Guard SO status — not CANCELLED
    if (doRecord.salesOrder.status === SalesOrderStatus.CANCELLED) {
      throw new Error("SO sudah dibatalkan — tidak bisa commit pengiriman.");
    }

    // 4. Collect physical items for stock posting
    const soItemMap = new Map(
      doRecord.salesOrder.items.map((item) => [item.productVariantId, item])
    );

    const stockLines: Array<{
      doItem: (typeof doRecord.items)[number];
      soItem: (typeof doRecord.salesOrder.items)[number];
    }> = [];

    for (const doItem of doRecord.items) {
      const soItem = soItemMap.get(doItem.productVariantId);
      if (!soItem) continue;

      const productType = soItem.productVariant.product.productType;
      if (productType === ProductType.SERVICE) continue; // D12: skip SERVICE

      // Validate residual: deliveredQty + DO qty <= SO qty
      const needed = doItem.quantity.toNumber();
      const delivered = soItem.deliveredQty.toNumber();
      const totalQty = soItem.quantity.toNumber();
      if (delivered + needed > totalQty) {
        throw new Error(
          `Residual tidak cukup untuk ${soItem.productVariant.product.name}: ` +
          `delivered(${delivered}) + needed(${needed}) > total(${totalQty})`
        );
      }

      stockLines.push({ doItem, soItem });
    }

    if (stockLines.length === 0) {
      throw new Error("Tidak ada item fisik yang bisa di-commit.");
    }

    // 5. Per physical line: consume reservations + validate + deduct stock
    for (const { doItem, soItem: _soItem } of stockLines) {
      const locationId = doRecord.sourceLocationId;
      const needed = doItem.quantity.toNumber();
      const pvId = doItem.productVariantId;

      // 5a. Consume ACTIVE reservations for this SO
      const reservations = await tx.stockReservation.findMany({
        where: {
          referenceId: doRecord.salesOrderId,
          reservedFor: ReservationType.SALES_ORDER,
          productVariantId: pvId,
          status: ReservationStatus.ACTIVE,
        },
        orderBy: { createdAt: "asc" },
      });

      let remaining = needed;
      for (const res of reservations) {
        if (remaining <= 0) break;
        const resQty = res.quantity.toNumber();
        const consume = Math.min(resQty, remaining);

        if (consume >= resQty) {
          await tx.stockReservation.update({
            where: { id: res.id },
            data: { status: ReservationStatus.FULFILLED },
          });
        } else {
          await tx.stockReservation.update({
            where: { id: res.id },
            data: { quantity: { decrement: consume } },
          });
        }

        remaining = Math.round((remaining - consume) * 10000) / 10000;
      }

      // 5b. Validate and lock stock (throws InsufficientStockError)
      await InventoryCoreService.validateAndLockStock(tx, locationId, pvId, needed);

      // 5c. Deduct stock
      await InventoryCoreService.deductStock(tx, locationId, pvId, needed);

      // 5d. Create stock movement + accounting
      const movement = await tx.stockMovement.create({
        data: {
          type: MovementType.OUT,
          productVariantId: pvId,
          fromLocationId: locationId,
          quantity: needed,
          salesOrderId: doRecord.salesOrderId,
          createdById: userId,
          reference: `Shipment for ${doRecord.salesOrder.orderNumber} via ${doRecord.orderNumber}`,
          createdAt: new Date(),
        },
      });
      await AccountingService.recordInventoryMovement(movement, tx);
    }

    // 6. Update DO → SHIPPED
    await tx.deliveryOrder.update({
      where: { id: deliveryOrderId },
      data: {
        status: DeliveryStatus.SHIPPED,
        ...(opts?.trackingNumber && { trackingNumber: opts.trackingNumber }),
        ...(opts?.carrier && { carrier: opts.carrier }),
      },
    });

    // 7. Increment deliveredQty for physical items
    for (const { doItem, soItem } of stockLines) {
      await tx.salesOrderItem.update({
        where: { id: soItem.id },
        data: { deliveredQty: { increment: doItem.quantity.toNumber() } },
      });
    }

    // 8. SO → SHIPPED (MVP: full residual, all physical lines delivered)
    await tx.salesOrder.update({
      where: { id: doRecord.salesOrderId },
      data: { status: SalesOrderStatus.SHIPPED },
    });

    // 9. Invoice DRAFT (after stock success)
    await InvoiceService.createDraftInvoiceFromOrder(
      doRecord.salesOrderId,
      userId
    );

    // 10. Fulfill remaining reservations
    await tx.stockReservation.updateMany({
      where: {
        referenceId: doRecord.salesOrderId,
        reservedFor: ReservationType.SALES_ORDER,
        status: ReservationStatus.ACTIVE,
      },
      data: { status: ReservationStatus.FULFILLED },
    });

    // 11. Audit log
    await logActivity({
      userId,
      action: "COMMIT_DELIVERY_SHIPMENT",
      entityType: "DeliveryOrder",
      entityId: deliveryOrderId,
      details:
        `DO ${doRecord.orderNumber} committed: stock OUT for ${stockLines.length} items, ` +
        `SO ${doRecord.salesOrder.orderNumber} → SHIPPED, invoice DRAFT created.`,
      tx,
    });

    return { success: true };
  });
}

// =============================================================================
// getDeliveryStockReadiness
// =============================================================================

/**
 * Query helper: per-line available vs needed stock.
 * Used by UI for soft warning banners.
 */
export async function getDeliveryStockReadiness(
  deliveryOrderId: string
): Promise<StockReadinessLine[]> {
  const doRecord = await prisma.deliveryOrder.findUnique({
    where: { id: deliveryOrderId },
    include: {
      items: {
        include: {
          productVariant: { include: { product: true } },
        },
      },
    },
  });

  if (!doRecord) return [];

  const lines: StockReadinessLine[] = [];

  for (const item of doRecord.items) {
    const neededQty = item.quantity.toNumber();

    const inventory = await prisma.inventory.findFirst({
      where: {
        locationId: doRecord.sourceLocationId,
        productVariantId: item.productVariantId,
      },
    });
    const onHand = inventory ? inventory.quantity.toNumber() : 0;

    // Get reserved stock for OTHER SOs (not this one)
    const reservations = await prisma.stockReservation.findMany({
      where: {
        locationId: doRecord.sourceLocationId,
        productVariantId: item.productVariantId,
        status: ReservationStatus.ACTIVE,
        referenceId: { not: doRecord.salesOrderId },
      },
    });
    const reservedByOthers = reservations.reduce(
      (sum, r) => sum + r.quantity.toNumber(),
      0
    );

    const availableQty = Math.max(0, onHand - reservedByOthers);
    const shortfall = Math.max(0, neededQty - availableQty);

    lines.push({
      productVariantId: item.productVariantId,
      productName: item.productVariant.product.name,
      neededQty,
      availableQty,
      reservedForThisSo: 0, // reserved for THIS SO will be consumed during commit
      shortfall,
      isReady: shortfall === 0,
    });
  }

  return lines;
}
