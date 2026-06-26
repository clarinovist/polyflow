import { prisma } from "@/lib/core/prisma";
import { logActivity } from "@/lib/tools/audit";
import { PurchaseOrderStatus, Prisma } from "@prisma/client";
import {
  CreatePurchaseOrderValues,
  UpdatePurchaseOrderValues,
} from "@/lib/schemas/purchasing";

export async function createOrder(
  data: CreatePurchaseOrderValues,
  userId: string,
) {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;

  const lastOrder = await prisma.purchaseOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });

  let nextNumber = 1;
  if (lastOrder?.orderNumber) {
    const numPart = parseInt(lastOrder.orderNumber.replace(prefix, ""));
    if (!isNaN(numPart)) nextNumber = numPart + 1;
  }

  const orderNumber = `${prefix}${nextNumber.toString().padStart(4, "0")}`;

  let totalAmount = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  const itemsWithTotals = data.items.map((item) => {
    const rawSubtotal = item.quantity * item.unitPrice;
    const discountAmount = rawSubtotal * ((item.discountPercent || 0) / 100);
    const subtotalAfterDiscount = rawSubtotal - discountAmount;
    const taxAmount = subtotalAfterDiscount * ((item.taxPercent || 0) / 100);
    const lineSubtotal = subtotalAfterDiscount + taxAmount;

    totalDiscount += discountAmount;
    totalTax += taxAmount;
    totalAmount += lineSubtotal;

    return {
      productVariantId: item.productVariantId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent || 0,
      taxPercent: item.taxPercent || 0,
      taxAmount,
      subtotal: lineSubtotal,
      dppOtherAmount: item.dppOtherAmount || null,
    };
  });

  const shippingCost = data.shippingCost || 0;
  const finalTotal = totalAmount + shippingCost;

  return await prisma.purchaseOrder.create({
    data: {
      orderNumber,
      supplierId: data.supplierId,
      orderDate: data.orderDate,
      expectedDate: data.expectedDate,
      deliveryAddress: data.deliveryAddress || null,
      notes: data.notes,
      totalAmount: finalTotal,
      discountAmount: totalDiscount,
      taxAmount: totalTax,
      shippingCost: shippingCost > 0 ? shippingCost : null,
      status: PurchaseOrderStatus.DRAFT,
      createdById: userId,
      items: {
        create: itemsWithTotals,
      },
    },
    include: { items: true, supplier: true },
  });
}

export async function updateOrder(data: UpdatePurchaseOrderValues) {
  // Load current order with items and invoices for validation
  const currentOrder = await prisma.purchaseOrder.findUnique({
    where: { id: data.id },
    include: {
      items: true,
      invoices: { select: { id: true, status: true } },
    },
  });

  if (!currentOrder) throw new Error("Purchase Order not found");

  const status = currentOrder.status;

  // === STATUS-BASED VALIDATION ===

  // DRAFT: can edit everything freely
  // SENT: can edit prices/notes/shipping, but NOT quantities for invoiced items
  // PARTIAL_RECEIVED: stricter — received items are locked
  // RECEIVED/CANCELLED: no editing allowed
  if (status === "RECEIVED" || status === "CANCELLED") {
    throw new Error(`Tidak bisa mengedit PO dengan status ${status}.`);
  }

  const hasInvoices = currentOrder.invoices.length > 0;

  // Build a map of existing items by id for comparison
  const existingItemsMap = new Map(
    currentOrder.items.map((item) => [item.id, item]),
  );

  // Validate each submitted item
  for (const submittedItem of data.items) {
    const existingItem = submittedItem.id
      ? existingItemsMap.get(submittedItem.id)
      : undefined;

    if (existingItem) {
      const receivedQty = Number(existingItem.receivedQty);

      // If item has been received, quantity cannot be reduced below receivedQty
      if (receivedQty > 0 && submittedItem.quantity < receivedQty) {
        throw new Error(
          `Qty untuk "${existingItem.productVariantId}" tidak bisa kurang dari ${receivedQty} (sudah diterima).`,
        );
      }

      // If item has been received and PO is SENT, quantity cannot change at all
      if (
        receivedQty > 0 &&
        status === "SENT" &&
        submittedItem.quantity !== Number(existingItem.quantity)
      ) {
        throw new Error(
          `Qty untuk item yang sudah diterima tidak bisa diubah pada status SENT.`,
        );
      }

      // If invoices exist, unit price cannot change (would mismatch invoice)
      if (
        hasInvoices &&
        submittedItem.unitPrice !== Number(existingItem.unitPrice)
      ) {
        throw new Error(
          `Harga satuan tidak bisa diubah karena sudah ada invoice terkait.`,
        );
      }
    }
  }

  // === CALCULATE TOTALS ===
  let totalAmount = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  const itemsWithTotals = data.items.map((item) => {
    const rawSubtotal = item.quantity * item.unitPrice;
    const discountAmount = rawSubtotal * ((item.discountPercent || 0) / 100);
    const subtotalAfterDiscount = rawSubtotal - discountAmount;
    const taxAmount = subtotalAfterDiscount * ((item.taxPercent || 0) / 100);
    const lineSubtotal = subtotalAfterDiscount + taxAmount;

    totalDiscount += discountAmount;
    totalTax += taxAmount;
    totalAmount += lineSubtotal;

    return {
      productVariantId: item.productVariantId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent || 0,
      taxPercent: item.taxPercent || 0,
      taxAmount,
      subtotal: lineSubtotal,
      dppOtherAmount: item.dppOtherAmount || null,
    };
  });

  const shippingCost = data.shippingCost || 0;
  const finalTotal = totalAmount + shippingCost;

  // === APPLY CHANGES ===
  // For received items: preserve their receivedQty by updating in-place
  // For new/removed items: handle carefully

  return await prisma.$transaction(async (tx) => {
    // Delete only items that are NOT received (received items stay)
    const unreceivedItemIds = currentOrder.items
      .filter((item) => Number(item.receivedQty) === 0)
      .map((item) => item.id);

    if (unreceivedItemIds.length > 0) {
      await tx.purchaseOrderItem.deleteMany({
        where: { id: { in: unreceivedItemIds } },
      });
    }

    // Create new item entries (including updated ones)
    // Preserve receivedQty for items that existed before
    const itemsToCreate = itemsWithTotals.map((item) => {
      const existingItem = data.items.find(
        (di) => di.productVariantId === item.productVariantId,
      );
      const existingRecord = existingItem?.id
        ? existingItemsMap.get(existingItem.id)
        : undefined;

      return {
        ...item,
        // Preserve receivedQty if item was carried over
        receivedQty: existingRecord ? existingRecord.receivedQty : 0,
      };
    });

    return await tx.purchaseOrder.update({
      where: { id: data.id },
      data: {
        supplierId: data.supplierId,
        orderDate: data.orderDate,
        expectedDate: data.expectedDate,
        deliveryAddress: data.deliveryAddress || null,
        notes: data.notes,
        totalAmount: finalTotal,
        discountAmount: totalDiscount,
        taxAmount: totalTax,
        shippingCost: shippingCost > 0 ? shippingCost : null,
        items: {
          create: itemsToCreate,
        },
      },
      include: { items: true, supplier: true },
    });
  });
}

export async function updateOrderStatus(
  id: string,
  status: PurchaseOrderStatus,
  userId: string,
) {
  const order = await prisma.purchaseOrder.update({
    where: { id },
    data: { status },
  });

  await logActivity({
    userId,
    action: "UPDATE_STATUS_PURCHASE",
    entityType: "PurchaseOrder",
    entityId: id,
    details: `Updated PO ${order.orderNumber} status to ${status}`,
  });

  return order;
}

export async function deleteOrder(id: string, userId: string) {
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { goodsReceipts: true, invoices: true },
  });

  if (!order) {
    throw new Error("Purchase Order not found");
  }

  if (order.status !== "DRAFT" && order.status !== "CANCELLED") {
    throw new Error("Only DRAFT or CANCELLED orders can be deleted");
  }

  if (order.goodsReceipts.length > 0) {
    throw new Error("Cannot delete order with existing goods receipts");
  }

  if (order.invoices.length > 0) {
    throw new Error("Cannot delete order with existing invoices");
  }

  return await prisma.$transaction(async (tx) => {
    await tx.purchaseOrderItem.deleteMany({
      where: { purchaseOrderId: id },
    });

    await tx.purchaseOrder.delete({
      where: { id },
    });

    await logActivity({
      userId,
      action: "DELETE_PURCHASE",
      entityType: "PurchaseOrder",
      entityId: id,
      details: `Deleted PO ${order.orderNumber}`,
      tx,
    });

    return { success: true, orderNumber: order.orderNumber };
  });
}

export async function getPurchaseOrders(filters?: {
  supplierId?: string;
  status?: PurchaseOrderStatus;
}) {
  const where: Prisma.PurchaseOrderWhereInput = {};
  if (filters?.supplierId) where.supplierId = filters.supplierId;
  if (filters?.status) where.status = filters.status;

  return await prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: true,
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPurchaseOrderById(id: string) {
  return await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      items: {
        include: {
          productVariant: {
            select: {
              id: true,
              name: true,
              skuCode: true,
              primaryUnit: true,
              standardCost: true,
            },
          },
        },
      },
      goodsReceipts: {
        include: {
          createdBy: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
      invoices: true,
      createdBy: { select: { name: true } },
    },
  });
}
