import { prisma } from "@/lib/core/prisma";
import { PurchaseOrderStatus } from "@prisma/client";
import {
  CreateWalkInReceiptValues,
  CreatePurchaseOrderValues,
  CreateGoodsReceiptValues,
} from "@/lib/schemas/purchasing";
import { createOrder, updateOrderStatus } from "./orders-service";
import { createGoodsReceipt } from "./receipts-service";
import { BusinessRuleError } from "@/lib/errors/errors";
import { logger } from "@/lib/config/logger";
import { WALK_IN_NOTE_PREFIX } from "@/lib/purchasing/walk-in";

export { WALK_IN_NOTE_PREFIX, isWalkInPurchaseOrderNotes } from "@/lib/purchasing/walk-in";

/**
 * PO awaiting physical receipt at warehouse.
 */
export async function listReceivablePurchaseOrders() {
  return prisma.purchaseOrder.findMany({
    where: {
      status: {
        in: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIAL_RECEIVED],
      },
    },
    select: {
      id: true,
      orderNumber: true,
      orderDate: true,
      expectedDate: true,
      status: true,
      notes: true,
      supplier: { select: { name: true, code: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          receivedQty: true,
          productVariant: {
            select: { name: true, skuCode: true, primaryUnit: true },
          },
        },
      },
      _count: { select: { items: true } },
    },
    orderBy: [{ expectedDate: "asc" }, { orderDate: "desc" }],
  });
}

/**
 * Goods receipts received on the given calendar day (local server TZ via Date bounds).
 */
export async function getGoodsReceiptsForDay(day: Date = new Date()) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);

  return prisma.goodsReceipt.findMany({
    where: {
      receivedDate: { gte: start, lte: end },
      isMaklon: false,
    },
    select: {
      id: true,
      receiptNumber: true,
      receivedDate: true,
      notes: true,
      purchaseOrder: {
        select: {
          id: true,
          orderNumber: true,
          notes: true,
          supplier: { select: { name: true } },
        },
      },
    },
    orderBy: { receivedDate: "desc" },
  });
}

async function resolveUnitCost(
  productVariantId: string,
  supplierId: string,
  explicit: number | null | undefined,
): Promise<number> {
  if (explicit != null && !Number.isNaN(Number(explicit))) {
    return Number(explicit);
  }

  const lastItem = await prisma.purchaseOrderItem.findFirst({
    where: {
      productVariantId,
      purchaseOrder: { supplierId },
    },
    orderBy: { purchaseOrder: { orderDate: "desc" } },
    select: { unitPrice: true },
  });
  if (lastItem) {
    return lastItem.unitPrice.toNumber();
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: productVariantId },
    select: { standardCost: true },
  });
  if (variant?.standardCost != null) {
    return Number(variant.standardCost);
  }

  return 0;
}

/**
 * Create a walk-in receipt: auto PO (SENT → RECEIVED via GR) + goods receipt in sequence.
 * Stock and costing reuse createGoodsReceipt.
 */
export async function createWalkInReceipt(
  data: CreateWalkInReceiptValues,
  userId: string,
) {
  if (!data.items.length) {
    throw new BusinessRuleError(
      "Minimal satu item harus diisi.",
      undefined,
      "WALK_IN_EMPTY_ITEMS",
    );
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: data.supplierId },
    select: { id: true, name: true },
  });
  if (!supplier) {
    throw new BusinessRuleError(
      "Supplier tidak ditemukan.",
      { supplierId: data.supplierId },
      "SUPPLIER_NOT_FOUND",
    );
  }

  const location = await prisma.location.findUnique({
    where: { id: data.locationId },
    select: { id: true },
  });
  if (!location) {
    throw new BusinessRuleError(
      "Lokasi gudang tidak ditemukan.",
      { locationId: data.locationId },
      "LOCATION_NOT_FOUND",
    );
  }

  const resolvedItems = await Promise.all(
    data.items.map(async (item) => {
      const unitCost = await resolveUnitCost(
        item.productVariantId,
        data.supplierId,
        item.unitCost,
      );
      return {
        productVariantId: item.productVariantId,
        quantity: item.receivedQty,
        unitPrice: unitCost,
        receivedQty: item.receivedQty,
        unitCost,
      };
    }),
  );

  const poNotes = [
    WALK_IN_NOTE_PREFIX,
    `No.nota: ${data.supplierRefNo}`,
    data.notes?.trim() || null,
  ]
    .filter(Boolean)
    .join("\n");

  const orderInput: CreatePurchaseOrderValues = {
    supplierId: data.supplierId,
    orderDate: data.receivedDate,
    expectedDate: data.receivedDate,
    deliveryAddress: undefined as unknown as string,
    notes: poNotes,
    shippingCost: 0,
    items: resolvedItems.map((i) => ({
      productVariantId: i.productVariantId,
      quantity: i.quantity,
      unitPrice: i.unitPrice > 0 ? i.unitPrice : 0.01, // schema requires positive unitPrice
      discountPercent: 0,
      taxPercent: 0,
      dppOtherAmount: null,
      ppnMode: "EXCLUDE",
    })),
  };

  let order: Awaited<ReturnType<typeof createOrder>>;
  try {
    order = await createOrder(orderInput, userId);
  } catch (err) {
    logger.error("Walk-in createOrder failed", { error: err, module: "WalkInReceipt" });
    throw err;
  }

  // Force SENT so status machine matches planned receive path before GR.
  await updateOrderStatus(order.id, PurchaseOrderStatus.SENT, userId);

  const grInput: CreateGoodsReceiptValues = {
    purchaseOrderId: order.id,
    isMaklon: false,
    receivedDate: data.receivedDate,
    locationId: data.locationId,
    notes: `Nota: ${data.supplierRefNo}${data.notes ? ` | ${data.notes}` : ""}`,
    items: resolvedItems.map((i) => ({
      productVariantId: i.productVariantId,
      receivedQty: i.receivedQty,
      unitCost: i.unitCost,
    })),
  };

  try {
    const receipt = await createGoodsReceipt(grInput, userId);

    return {
      purchaseOrder: order,
      goodsReceipt: receipt,
    };
  } catch (err) {
    // Best-effort: leave PO as SENT so warehouse/finance can recover; log clearly.
    logger.error("Walk-in createGoodsReceipt failed after PO created", {
      error: err,
      module: "WalkInReceipt",
      purchaseOrderId: order.id,
    });
    throw err;
  }
}
