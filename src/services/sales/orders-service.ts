import { prisma } from "@/lib/core/prisma";
import {
  SalesOrderStatus,
  SalesOrderType,
  ReservationType,
  ReservationStatus,
  Prisma,
  ProductType,
  InvoiceStatus,
} from "@prisma/client";
import {
  CreateSalesOrderValues,
  UpdateSalesOrderValues,
} from "@/lib/schemas/sales";
import { logActivity } from "@/lib/tools/audit";
import { createStockReservation } from "@/services/inventory/reservation-service";
import { ProductionService } from "@/services/production/production-service";
import { checkCreditLimit } from "./credit-service";
import { logger } from "@/lib/config/logger";
import { processOrderItems } from "./order-item-processor";
import {
  BusinessRuleError,
  NotFoundError,
} from "@/lib/errors/errors";

// ── Confirm Order types ──────────────────────────────────────────────
export type ConfirmOrderWarning = {
  code: "MISSING_DEFAULT_BOM" | "WO_CREATE_FAILED" | "FG_DEMAND_QUEUED";
  productVariantIds: string[];
  productNames: string[];
  message: string;
};

export type ConfirmOrderResult = {
  orderId: string;
  status: SalesOrderStatus;
  shortageCount: number;
  productionOrdersCreated: number;
  warnings: ConfirmOrderWarning[];
};

async function validateMaklonSourceLocation(
  sourceLocationId: string,
  orderType: SalesOrderType,
) {
  if (orderType !== SalesOrderType.MAKLON_JASA) {
    return;
  }

  const sourceLocation = await prisma.location.findUnique({
    where: { id: sourceLocationId },
    select: { id: true, locationType: true, name: true },
  });

  if (!sourceLocation) {
    throw new NotFoundError("Location", sourceLocationId);
  }

  if (sourceLocation.locationType !== "CUSTOMER_OWNED") {
    throw new BusinessRuleError(
      `Maklon Jasa orders must use a customer-owned warehouse. '${sourceLocation.name}' is not a customer-owned location.`,
      { locationId: sourceLocationId, locationName: sourceLocation.name, requiredType: "CUSTOMER_OWNED" },
      "CUSTOMER_OWNED_LOCATION_REQUIRED",
    );
  }
}

export async function getOrders(filters?: {
  customerId?: string;
  includeItems?: boolean;
  startDate?: Date;
  endDate?: Date;
  demandType?: "customer" | "legacy-internal";
  /** Single order type (legacy) */
  orderType?: "MAKE_TO_STOCK" | "MAKE_TO_ORDER" | "MAKLON_JASA";
  /** Multiple order types (orthogonal filter) */
  orderTypes?: Array<"MAKE_TO_STOCK" | "MAKE_TO_ORDER" | "MAKLON_JASA">;
  paymentState?: "outstanding" | "paid" | "no_invoice";
  statusFilter?: SalesOrderStatus[];
}) {
  const where: Prisma.SalesOrderWhereInput = {};
  if (filters?.customerId) where.customerId = filters.customerId;

  // Order type filter — support single (legacy) or multi (new)
  if (filters?.orderTypes && filters.orderTypes.length > 0) {
    where.orderType = { in: filters.orderTypes };
  } else if (filters?.orderType) {
    where.orderType = filters.orderType;
  }

  if (filters?.demandType === "customer") {
    where.customerId = { not: null };
  } else if (filters?.demandType === "legacy-internal") {
    where.customerId = null;
  }

  if (filters?.startDate && filters?.endDate) {
    where.orderDate = {
      gte: filters.startDate,
      lte: filters.endDate,
    };
  }

  // Payment state filter
  if (filters?.paymentState === "outstanding") {
    where.invoices = {
      some: {
        status: {
          in: [
            InvoiceStatus.UNPAID,
            InvoiceStatus.PARTIAL,
            InvoiceStatus.OVERDUE,
          ],
        },
      },
    };
  } else if (filters?.paymentState === "paid") {
    // Fully paid: at least one PAID invoice, and no open/draft invoices.
    // CANCELLED invoices are ignored (allowed alongside PAID).
    where.invoices = {
      some: {
        status: InvoiceStatus.PAID,
      },
      none: {
        status: {
          in: [
            InvoiceStatus.UNPAID,
            InvoiceStatus.PARTIAL,
            InvoiceStatus.OVERDUE,
            InvoiceStatus.DRAFT,
          ],
        },
      },
    };
  } else if (filters?.paymentState === "no_invoice") {
    where.invoices = { none: {} };
  }

  if (filters?.statusFilter && filters.statusFilter.length > 0) {
    where.status = { in: filters.statusFilter };
  }

  const include: Prisma.SalesOrderInclude = {
    customer: true,
    sourceLocation: true,
    invoices: {
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        invoiceDate: true,
        dueDate: true,
      },
      orderBy: { invoiceDate: "desc" },
    },
    _count: {
      select: {
        items: true,
        productionOrders: true,
      },
    },
  };

  if (filters?.includeItems) {
    include.items = {
      include: {
        productVariant: {
          include: {
            product: true,
          },
        },
      },
    };
    // Needed by Create SJ dialog: exclude SO that already have open DO
    include.deliveryOrders = {
      select: { id: true, orderNumber: true, status: true },
      where: { status: { in: ["PENDING", "LOADING"] } },
    };
  }

  return await prisma.salesOrder.findMany({
    where,
    include,
    orderBy: { orderDate: "desc" },
  });
}

export async function getOrderById(id: string) {
  return await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      customer: true,
      sourceLocation: true,
      items: {
        include: {
          productVariant: {
            include: {
              product: true,
            },
          },
        },
      },
      movements: {
        orderBy: { createdAt: "desc" },
      },
      productionOrders: true,
      invoices: true,
      deliveryOrders: {
        include: {
          items: {
            include: {
              productVariant: {
                include: { product: true },
              },
            },
          },
        },
      },
      createdBy: {
        select: { name: true },
      },
    },
  });
}

export async function createOrder(
  data: CreateSalesOrderValues,
  userId: string,
) {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;

  const lastOrder = await prisma.salesOrder.findFirst({
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

  // Normalize empty string to null for Prisma
  const sourceLocationId = data.sourceLocationId || null;

  await validateMaklonSourceLocation(sourceLocationId || "", data.orderType);

  const {
    totalAmount,
    totalDiscount,
    totalTax,
    items: itemsWithTotals,
  } = await processOrderItems(data.items, data.orderType);

  if (data.customerId) {
    await checkCreditLimit(data.customerId, totalAmount);
  }

  const shippingCost = data.shippingCost || 0;
  const finalTotal = totalAmount + shippingCost;

  const order = await prisma.salesOrder.create({
    data: {
      orderNumber,
      customerId: data.customerId ? data.customerId : undefined,
      sourceLocationId: sourceLocationId,
      orderDate: data.orderDate,
      expectedDate: data.expectedDate,
      orderType: data.orderType,
      notes: data.notes,
      totalAmount: finalTotal,
      discountAmount: totalDiscount,
      taxAmount: totalTax,
      shippingCost: shippingCost > 0 ? shippingCost : null,
      status: SalesOrderStatus.DRAFT,
      createdById: userId,
      items: {
        create: itemsWithTotals.map((item) => ({
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          enteredQuantity: item.enteredQuantity,
          enteredUnit: item.enteredUnit,
          conversionFactorSnapshot: item.conversionFactorSnapshot,
          enteredUnitPrice: item.enteredUnitPrice,
          discountPercent: item.discountPercent,
          taxPercent: item.taxPercent,
          taxAmount: item.taxAmount,
          subtotal: item.subtotal,
          dppOtherAmount: item.dppOtherAmount,
          ppnMode: item.ppnMode,
        })),
      },
    },
    include: { items: true },
  });

  await logActivity({
    userId,
    action: 'SALES_ORDER_CREATED',
    entityType: 'SalesOrder',
    entityId: order.id,
    details: `Sales Order ${orderNumber} created. Total: ${finalTotal}`,
  });

  return order;
}

export async function updateOrder(
  data: UpdateSalesOrderValues,
  _userId: string,
) {
  // Load current order with items, invoices, and delivery orders for validation
  const currentOrder = await prisma.salesOrder.findUnique({
    where: { id: data.id },
    include: {
      items: true,
      invoices: { select: { id: true, status: true } },
      deliveryOrders: { select: { id: true } },
    },
  });

  if (!currentOrder) {
    throw new NotFoundError("Sales Order", data.id);
  }

  const status = currentOrder.status;

  // === STATUS-BASED VALIDATION ===

  // SHIPPED / DELIVERED / CANCELLED: no editing allowed
  if (
    status === SalesOrderStatus.SHIPPED ||
    status === SalesOrderStatus.DELIVERED ||
    status === SalesOrderStatus.CANCELLED
  ) {
    throw new BusinessRuleError(
      `Cannot edit Sales Order with status ${status}.`,
      { status, orderId: data.id },
      "INVALID_ORDER_STATUS",
    );
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
      const deliveredQty = Number(existingItem.deliveredQty);

      // If item has been delivered, quantity cannot be reduced below deliveredQty
      if (deliveredQty > 0 && submittedItem.quantity < deliveredQty) {
        throw new BusinessRuleError(
          `Qty cannot be less than ${deliveredQty} (already delivered).`,
          { deliveredQty, submittedQty: submittedItem.quantity },
        );
      }

      // If invoices exist, unit price cannot change (would mismatch invoice)
      if (
        hasInvoices &&
        submittedItem.unitPrice !== Number(existingItem.unitPrice)
      ) {
        throw new BusinessRuleError(
          "Unit price cannot be changed because invoices already exist for this order.",
          { orderId: data.id },
        );
      }
    }
  }

  // Normalize empty string to null for Prisma
  const sourceLocationId = data.sourceLocationId || null;

  await validateMaklonSourceLocation(
    sourceLocationId || "",
    currentOrder.orderType,
  );

  const {
    totalAmount,
    totalDiscount,
    totalTax,
    items: itemsWithTotals,
  } = await processOrderItems(data.items, currentOrder.orderType);

  if (data.customerId) {
    await checkCreditLimit(data.customerId, totalAmount);
  }

  const shippingCost = data.shippingCost || 0;
  const finalTotal = totalAmount + shippingCost;

  return await prisma.$transaction(async (tx) => {
    // Delete only items that are NOT delivered (delivered items stay)
    const undeliveredItemIds = currentOrder.items
      .filter((item) => Number(item.deliveredQty) === 0)
      .map((item) => item.id);

    if (undeliveredItemIds.length > 0) {
      await tx.salesOrderItem.deleteMany({
        where: { id: { in: undeliveredItemIds } },
      });
    }

    // Create new item entries, preserving deliveredQty for carried-over items
    const itemsToCreate = itemsWithTotals.map((item) => {
      const submittedItem = data.items.find(
        (di) => di.productVariantId === item.productVariantId,
      );
      const existingRecord = submittedItem?.id
        ? existingItemsMap.get(submittedItem.id)
        : undefined;

      return {
        productVariantId: item.productVariantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        enteredQuantity: item.enteredQuantity,
        enteredUnit: item.enteredUnit,
        conversionFactorSnapshot: item.conversionFactorSnapshot,
        enteredUnitPrice: item.enteredUnitPrice,
        discountPercent: item.discountPercent,
        taxPercent: item.taxPercent,
        taxAmount: item.taxAmount,
        subtotal: item.subtotal,
        dppOtherAmount: item.dppOtherAmount,
        ppnMode: item.ppnMode,
        // Preserve deliveredQty if item was carried over
        deliveredQty: existingRecord ? existingRecord.deliveredQty : 0,
      };
    });

    return await tx.salesOrder.update({
      where: { id: data.id },
      data: {
        customerId: data.customerId,
        sourceLocationId: sourceLocationId,
        orderDate: data.orderDate,
        expectedDate: data.expectedDate,
        notes: data.notes,
        totalAmount: finalTotal,
        discountAmount: totalDiscount,
        taxAmount: totalTax,
        shippingCost: shippingCost > 0 ? shippingCost : null,
        items: {
          create: itemsToCreate,
        },
      },
      include: { items: true },
    });
  });
}

export async function confirmOrder(
  id: string,
  userId: string,
): Promise<ConfirmOrderResult> {
  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          productVariant: {
            include: { product: true },
          },
        },
      },
    },
  });

  if (!order) throw new NotFoundError("Sales Order", id);
  if (order.status !== SalesOrderStatus.DRAFT) {
    throw new BusinessRuleError(
      "Only draft orders can be confirmed",
      { status: order.status },
    );
  }
  if (!order.customerId) {
    throw new BusinessRuleError(
      "Sales Order without customer is treated as a legacy internal stock build. Assign a customer first, or use a Production Order for internal replenishment.",
    );
  }
  if (!order.sourceLocationId) {
    throw new BusinessRuleError(
      "Source location is required before confirming. Please edit the order and select a warehouse.",
    );
  }

  if (order.customerId && order.orderType !== SalesOrderType.MAKE_TO_ORDER) {
    await checkCreditLimit(order.customerId, Number(order.totalAmount || 0));
  }

  // ── Default status by order type ──────────────────────────────
  // MTS: CONFIRMED (upgraded to IN_PRODUCTION only when WO is created)
  // MTO / Maklon: IN_PRODUCTION (production-led by design)
  let nextStatus =
    order.orderType === SalesOrderType.MAKE_TO_ORDER ||
    order.orderType === SalesOrderType.MAKLON_JASA
      ? SalesOrderStatus.IN_PRODUCTION
      : SalesOrderStatus.CONFIRMED;

  const shortages: { productVariantId: string; quantity: number }[] = [];
  const warnings: ConfirmOrderWarning[] = [];
  // Track whether we had creatable shortages (for MTS status upgrade)
  let hadCreatableShortage = false;

  await prisma.$transaction(async (tx) => {
    if (order.sourceLocationId) {
      const variantIds = order.items.map((item) => item.productVariantId);

      // Bulk fetch inventory for all items
      const inventories = await tx.inventory.findMany({
        where: {
          locationId: order.sourceLocationId,
          productVariantId: { in: variantIds },
        },
      });
      const inventoryMap = new Map(
        inventories.map((inv) => [
          inv.productVariantId,
          inv.quantity.toNumber(),
        ]),
      );

      // Bulk fetch active reservations for all items
      const activeReservations = await tx.stockReservation.groupBy({
        by: ["productVariantId"],
        where: {
          locationId: order.sourceLocationId,
          productVariantId: { in: variantIds },
          status: ReservationStatus.ACTIVE,
        },
        _sum: { quantity: true },
      });
      const reservationMap = new Map(
        activeReservations.map((res) => [
          res.productVariantId,
          res._sum.quantity?.toNumber() || 0,
        ]),
      );

      for (const item of order.items) {
        if (item.productVariant.product.productType === ProductType.SERVICE) {
          // SERVICE items (Maklon Jasa) don't have physical inventory or standard BOMs.
          // WOs for Maklon must be created manually in the Production module.
          continue;
        }

        let activeReservationAmount = 0;
        let shortageAmount = item.quantity.toNumber();

        const currentQty = inventoryMap.get(item.productVariantId) || 0;
        const reservedQty = reservationMap.get(item.productVariantId) || 0;
        const available = currentQty - reservedQty;
        const demand = item.quantity.toNumber();

        if (available >= demand) {
          activeReservationAmount = demand;
          shortageAmount = 0;
        } else {
          activeReservationAmount = Math.max(0, available);
          shortageAmount = demand - activeReservationAmount;
        }

        if (activeReservationAmount > 0) {
          await createStockReservation(
            {
              productVariantId: item.productVariantId,
              locationId: order.sourceLocationId,
              quantity: activeReservationAmount,
              reservedFor: ReservationType.SALES_ORDER,
              referenceId: order.id,
              reservedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
            tx,
          );
        }

        if (shortageAmount > 0) {
          shortages.push({
            productVariantId: item.productVariantId,
            quantity: shortageAmount,
          });
        }
      }
    }

    // ── Soft BOM check: split creatable vs missing ──────────────
    if (shortages.length > 0) {
      const shortageVariantIds = shortages.map((s) => s.productVariantId);

      const boms = await tx.bom.findMany({
        where: {
          productVariantId: { in: shortageVariantIds },
          isDefault: true,
          isActive: true,
        },
        select: { productVariantId: true },
      });
      const bomVariantIds = new Set(boms.map((b) => b.productVariantId));

      const missingBomVariantIds = shortageVariantIds.filter(
        (vid) => !bomVariantIds.has(vid),
      );

      // Missing BOM → warning (not throw)
      if (missingBomVariantIds.length > 0) {
        const variants = await tx.productVariant.findMany({
          where: { id: { in: missingBomVariantIds } },
          select: { id: true, name: true },
        });
        const names = variants.map((v) => v.name);
        warnings.push({
          code: "MISSING_DEFAULT_BOM",
          productVariantIds: missingBomVariantIds,
          productNames: names,
          message: `Order dikonfirmasi. Perintah produksi tidak dibuat otomatis karena BOM default belum ada untuk: ${names.join(", ")}. Tim produksi/PPIC perlu membuat BOM lalu buat WO manual.`,
        });
      }

      // Creatable shortages (have BOM) → will auto-create WO
      const creatableVariantIds = shortageVariantIds.filter((vid) =>
        bomVariantIds.has(vid),
      );
      hadCreatableShortage = creatableVariantIds.length > 0;

      // Upgrade to IN_PRODUCTION when there are creatable shortages
      // (MTS default is CONFIRMED; MTO/Maklon already IN_PRODUCTION)
      if (hadCreatableShortage) {
        nextStatus = SalesOrderStatus.IN_PRODUCTION;
      } else if (order.orderType === SalesOrderType.MAKE_TO_STOCK) {
        // MTS + only missing-BOM shortages → stay CONFIRMED
        nextStatus = SalesOrderStatus.CONFIRMED;
      }
    }

    await tx.salesOrder.update({
      where: { id },
      data: { status: nextStatus },
    });

    const warningSummary =
      warnings.length > 0
        ? `. Warnings: ${warnings.map((w) => w.code).join(", ")}`
        : "";
    await logActivity({
      userId,
      action: "SALES_ORDER_CONFIRMED",
      entityType: "SalesOrder",
      entityId: id,
      details: `Sales Order ${order.orderNumber} confirmed. Status: ${nextStatus}. Shortages: ${shortages.length}${warningSummary}`,
      tx,
    });
  });

  // ── Auto-create WO only for creatable (BOM-present) shortages ──
  let productionOrdersCreated = 0;

  // Feature flag: auto-create WO on SO confirm.
  // Default: false (shortages go to FG demand board instead).
  const autoCreateWo = process.env.AUTO_CREATE_WO_ON_SO_CONFIRM === "true";

  // Build name map from order items for friendly warning messages
  const variantNameMap = new Map(
    order.items.map((item) => [item.productVariantId, item.productVariant.name]),
  );

  if (autoCreateWo && shortages.length > 0) {
    const shortageVariantIds = shortages.map((s) => s.productVariantId);

    // Re-query which variants have BOM (could have been created between tx and now)
    const bomsNow = await prisma.bom.findMany({
      where: {
        productVariantId: { in: shortageVariantIds },
        isDefault: true,
        isActive: true,
      },
      select: { productVariantId: true },
    });
    const bomNowIds = new Set(bomsNow.map((b) => b.productVariantId));

    // Only attempt WO creation for shortages that currently have a BOM
    const creatableShortages = shortages.filter((s) =>
      bomNowIds.has(s.productVariantId),
    );

    if (creatableShortages.length > 0) {
      try {
        const results = await Promise.allSettled(
          creatableShortages.map((shortage) =>
            ProductionService.createOrderFromSales(
              order.id,
              shortage.productVariantId,
              shortage.quantity,
            ),
          ),
        );

        results.forEach((res, idx) => {
          if (res.status === "fulfilled") {
            productionOrdersCreated++;
          } else {
            const variantId = creatableShortages[idx].productVariantId;
            const name = variantNameMap.get(variantId) || variantId;
            logger.error(
              `Failed to auto-create WO for item ${variantId}`,
              { error: res.reason, module: "SalesOrderService" },
            );
            warnings.push({
              code: "WO_CREATE_FAILED",
              productVariantIds: [variantId],
              productNames: [name],
              message: `Gagal membuat perintah produksi otomatis untuk: ${name}.`,
            });
          }
        });
      } catch (error) {
        logger.error("Unexpected error in WO auto-creation", {
          error,
          orderId: id,
          module: "SalesOrderService",
        });
        const names = creatableShortages.map(
          (s) => variantNameMap.get(s.productVariantId) || s.productVariantId,
        );
        warnings.push({
          code: "WO_CREATE_FAILED",
          productVariantIds: creatableShortages.map((s) => s.productVariantId),
          productNames: names,
          message: `Gagal membuat perintah produksi otomatis secara tak terduga untuk: ${names.join(", ")}.`,
        });
      }
    }

    // MTS post-adjust: if no WO was actually created, downgrade back to CONFIRMED
    if (
      order.orderType === SalesOrderType.MAKE_TO_STOCK &&
      productionOrdersCreated === 0 &&
      nextStatus === SalesOrderStatus.IN_PRODUCTION
    ) {
      await prisma.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.CONFIRMED },
      });
      nextStatus = SalesOrderStatus.CONFIRMED;

      // Append activity log noting the status adjustment
      await logActivity({
        userId,
        action: "SALES_ORDER_CONFIRMED",
        entityType: "SalesOrder",
        entityId: id,
        details: `Status adjusted to CONFIRMED: no production orders created (all auto-WO failed or skipped).`,
      });
    }
  }

  // When auto-WO is disabled, inform that shortages are on the FG demand board
  if (!autoCreateWo && shortages.length > 0) {
    warnings.push({
      code: "FG_DEMAND_QUEUED",
      productVariantIds: shortages.map((s) => s.productVariantId),
      productNames: shortages.map(
        (s) => variantNameMap.get(s.productVariantId) || s.productVariantId,
      ),
      message: `Kekurangan stok masuk antrian produksi (Papan Permintaan FG). Buka Production → Papan Permintaan FG untuk membuat SPK.`,
    });
  }

  return {
    orderId: id,
    status: nextStatus,
    shortageCount: shortages.length,
    productionOrdersCreated,
    warnings,
  };
}

export async function cancelOrder(id: string, userId: string) {
  const order = await prisma.salesOrder.findUnique({ where: { id } });
  if (!order) throw new NotFoundError("Sales Order", id);

  if (
    order.status === SalesOrderStatus.SHIPPED ||
    order.status === SalesOrderStatus.DELIVERED
  ) {
    throw new BusinessRuleError(
      "Cannot cancel orders that have been shipped or delivered.",
      { status: order.status, orderId: id },
      "INVALID_ORDER_STATUS",
    );
  }

  // Block cancel if material issues have been issued (physical stock already moved)
  const issuedMaterialIssues = await prisma.materialIssue.count({
    where: {
      productionOrder: { salesOrderId: id },
      status: "ISSUED",
    },
  });
  if (issuedMaterialIssues > 0) {
    throw new BusinessRuleError(
      "Cannot cancel order: material issues have already been issued to production. Void the material issues first.",
      { orderId: id, issuedCount: issuedMaterialIssues },
      "MATERIAL_ISSUES_EXIST",
    );
  }

  // Block cancel if delivery stock movements exist
  const deliveryMovements = await prisma.stockMovement.count({
    where: {
      salesOrderId: id,
      type: "OUT",
    },
  });
  if (deliveryMovements > 0) {
    throw new BusinessRuleError(
      "Cannot cancel order: delivery stock movements already exist. Reverse deliveries first.",
      { orderId: id, movementCount: deliveryMovements },
      "DELIVERY_MOVEMENTS_EXIST",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.stockReservation.updateMany({
      where: {
        referenceId: order.id,
        reservedFor: ReservationType.SALES_ORDER,
        status: ReservationStatus.ACTIVE,
      },
      data: { status: ReservationStatus.CANCELLED },
    });

    await tx.salesOrder.update({
      where: { id },
      data: { status: SalesOrderStatus.CANCELLED },
    });

    await logActivity({
      userId,
      action: "SALES_ORDER_CANCELLED",
      entityType: "SalesOrder",
      entityId: id,
      details: `Sales Order ${order.orderNumber} cancelled`,
      tx,
    });
  });
}

export async function deleteOrder(id: string) {
  const order = await prisma.salesOrder.findUnique({ where: { id } });
  if (!order) throw new NotFoundError("Sales Order", id);
  if (order.status !== SalesOrderStatus.DRAFT)
    throw new BusinessRuleError(
      "Only draft orders can be deleted.",
      { status: order.status, orderId: id },
      "INVALID_ORDER_STATUS",
    );

  await prisma.salesOrder.delete({ where: { id } });
}
