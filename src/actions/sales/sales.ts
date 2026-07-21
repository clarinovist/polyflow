"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import {
  createSalesOrderSchema,
  updateSalesOrderSchema,
  shipSalesOrderSchema,
  CreateSalesOrderValues,
  UpdateSalesOrderValues,
} from "@/lib/schemas/sales";
import { SalesService } from "@/services/sales/sales-service";
import { SalesOrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/tools/auth-checks";
import { requireSalesApprover } from "@/lib/auth/sales-access";
import { safeAction, NotFoundError } from "@/lib/errors/errors";
import { serializeData } from "@/lib/utils/utils";

export const getSalesOrders = withTenant(async function getSalesOrders(
  includeItems = false,
  dateRange?: { startDate?: Date; endDate?: Date },
  demandType?: "customer" | "legacy-internal",
  extraFilters?: {
    orderType?: "MAKE_TO_STOCK" | "MAKE_TO_ORDER" | "MAKLON_JASA";
    orderTypes?: Array<"MAKE_TO_STOCK" | "MAKE_TO_ORDER" | "MAKLON_JASA">;
    paymentState?: "outstanding" | "paid" | "no_invoice";
    statusFilter?: SalesOrderStatus[];
  },
) {
  return safeAction(async () => {
    await requireAuth();
    const orders = await SalesService.getOrders({
      includeItems,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
      demandType,
      orderType: extraFilters?.orderType,
      orderTypes: extraFilters?.orderTypes,
      paymentState: extraFilters?.paymentState,
      statusFilter: extraFilters?.statusFilter,
    });
    return serializeData(orders);
  });
});

export const getSalesOrdersByCustomerId = withTenant(
  async function getSalesOrdersByCustomerId(customerId: string) {
    return safeAction(async () => {
      await requireAuth();
      const orders = await SalesService.getOrders({ customerId });
      return serializeData(orders);
    });
  },
);

export const getSalesOrderById = withTenant(async function getSalesOrderById(
  id: string,
) {
  return safeAction(async () => {
    await requireAuth();
    const order = await SalesService.getOrderById(id);
    if (!order) return null;
    return serializeData(order);
  });
});

export const createSalesOrder = withTenant(async function createSalesOrder(
  data: CreateSalesOrderValues,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    const result = createSalesOrderSchema.parse(data);

    // Handle custom items: create products on-the-fly and replace temp IDs
    const customItems = result.customItems || [];
    let processedItems = result.items;

    if (customItems.length > 0) {
      const tempIdToRealId = new Map<string, string>();

      for (const customItem of customItems) {
        // Create product
        const product = await prisma.product.create({
          data: {
            name: customItem.name,
            productType: "FINISHED_GOOD",
          },
        });

        // Create variant with auto-generated SKU
        const skuCode = customItem.name
          .toUpperCase()
          .replace(/[^A-Z0-9\s]/g, "")
          .split(/\s+/)
          .map((w: string) => w[0])
          .join("")
          .slice(0, 8)
          .padEnd(5, "0");

        const variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            name: customItem.name,
            skuCode,
            primaryUnit: "KG",
            salesUnit: "KG",
            conversionFactor: 1,
            price: customItem.sellPrice || null,
          },
        });

        tempIdToRealId.set(customItem.tempId, variant.id);
      }

      // Replace temp IDs in items
      processedItems = result.items.map((item) => ({
        ...item,
        productVariantId:
          tempIdToRealId.get(item.productVariantId) || item.productVariantId,
      }));
    }

    const order = await SalesService.createOrder(
      { ...result, items: processedItems },
      session.user.id,
    );
    revalidatePath("/sales");
    return order;
  });
});

export const updateSalesOrder = withTenant(async function updateSalesOrder(
  data: UpdateSalesOrderValues,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    const result = updateSalesOrderSchema.parse(data);
    await SalesService.updateOrder(result, session.user.id);
    revalidatePath("/sales");
    revalidatePath(`/sales/orders/${data.id}`);
    return { id: data.id };
  });
});

export const confirmSalesOrder = withTenant(async function confirmSalesOrder(
  id: string,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    const result = await SalesService.confirmOrder(id, session.user.id);
    revalidatePath("/sales");
    revalidatePath(`/sales/orders/${id}`);
    return result;
  });
});

export const markReadyToShip = withTenant(async function markReadyToShip(
  id: string,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    await SalesService.markReadyToShip(id, session.user.id);
    revalidatePath("/sales");
    revalidatePath(`/sales/orders/${id}`);
    return true;
  });
});

export const shipSalesOrder = withTenant(async function shipSalesOrder(data: {
  id: string;
  trackingNumber?: string;
  carrier?: string;
}) {
  return safeAction(async () => {
    const session = await requireAuth();
    const validatedData = shipSalesOrderSchema.parse(data);
    await SalesService.shipOrder(validatedData.id, session.user.id, {
      trackingNumber: validatedData.trackingNumber,
      carrier: validatedData.carrier,
    });
    revalidatePath("/sales");
    revalidatePath(`/sales/orders/${validatedData.id}`);
    revalidatePath("/warehouse/inventory"); // Stock changed
    return true;
  });
});

export const checkSalesOrderFulfillment = withTenant(
  async function checkSalesOrderFulfillment(id: string) {
    return safeAction(async () => {
      await requireAuth();
      const order = await prisma.salesOrder.findUnique({
        where: { id },
        include: {
          items: true,
          productionOrders: {
            select: {
              status: true,
              actualQuantity: true,
              plannedQuantity: true,
            },
          },
        },
      });

      if (!order) throw new NotFoundError("Sales Order", id);

      const productVariantIds = order.items.map(
        (item) => item.productVariantId,
      );
      const sourceLocationId = order.sourceLocationId || "";

      // Batch fetch inventory
      const stocks = await prisma.inventory.findMany({
        where: {
          locationId: sourceLocationId,
          productVariantId: { in: productVariantIds },
        },
      });

      const stockMap = new Map(
        stocks.map((s) => [s.productVariantId, Number(s.quantity)]),
      );

      // Batch fetch reservations
      const reservations = await prisma.stockReservation.groupBy({
        by: ["productVariantId"],
        where: {
          locationId: sourceLocationId,
          productVariantId: { in: productVariantIds },
          status: "ACTIVE",
          referenceId: { not: order.id },
        },
        _sum: { quantity: true },
      });

      const reservationMap = new Map(
        reservations.map((r) => [
          r.productVariantId,
          r._sum.quantity?.toNumber() || 0,
        ]),
      );

      const shortages = [];
      for (const item of order.items) {
        const reservedQuantity = reservationMap.get(item.productVariantId) || 0;
        const rawAvailable = stockMap.get(item.productVariantId) || 0;
        const available = Math.max(0, rawAvailable - reservedQuantity);
        const required = Number(item.quantity);

        if (available < required) {
          shortages.push({
            productVariantId: item.productVariantId,
            required,
            available,
            shortage: required - available,
          });
        }
      }

      return {
        canFulfill: shortages.length === 0,
        shortages,
      };
    });
  },
);

export const deliverSalesOrder = withTenant(async function deliverSalesOrder(
  id: string,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    await SalesService.deliverOrder(id, session.user.id);
    revalidatePath("/sales");
    revalidatePath(`/sales/orders/${id}`);
    revalidatePath("/sales/deliveries");
    revalidatePath(`/sales/deliveries/${id}`);
    return true;
  });
});

export const cancelSalesOrder = withTenant(async function cancelSalesOrder(
  id: string,
) {
  return safeAction(async () => {
    const session = await requireSalesApprover();
    await SalesService.cancelOrder(id, session.user.id);
    revalidatePath("/sales");
    revalidatePath(`/sales/orders/${id}`);
    return true;
  });
});

export const deleteSalesOrder = withTenant(async function deleteSalesOrder(
  id: string,
) {
  return safeAction(async () => {
    await requireAuth();
    await SalesService.deleteOrder(id);
    revalidatePath("/sales");
    return true;
  });
});

export const getSalesOrderStats = withTenant(
  async function getSalesOrderStats(dateRange?: {
    startDate?: Date;
    endDate?: Date;
  }) {
    return safeAction(async () => {
      await requireAuth();

      // Scope: ORDERED customer's orderDate — align with list page's filtered view
      const where: Record<string, unknown> = {
        demandType: "customer",
      };
      if (dateRange?.startDate && dateRange?.endDate) {
        where.orderDate = {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        };
      }

      const stats = await prisma.salesOrder.groupBy({
        where,
        by: ["status"],
        _count: { status: true },
        _sum: { totalAmount: true },
      });

      const sum = (rows: typeof stats) =>
        rows.reduce((acc, r) => acc + Number(r._sum.totalAmount || 0), 0);
      const count = (rows: typeof stats) =>
        rows.reduce((acc, r) => acc + r._count.status, 0);

      const isActive = (s: string) =>
        ["DRAFT", "CONFIRMED", "IN_PRODUCTION", "READY_TO_SHIP"].includes(s);
      const isDone = (s: string) => ["SHIPPED", "DELIVERED"].includes(s);

      const activeRows = stats.filter((s) => isActive(s.status));
      const doneRows = stats.filter((s) => isDone(s.status));
      const cancelledRows = stats.filter((s) => s.status === "CANCELLED");

      // Pipeline = aktif non-batal — jawaban original request "kalau semua terkonversi"
      const pipelineRows = activeRows; // never includes CANCELLED/DONE

      return {
        totalOrders: count(stats),
        activeCount: count(activeRows),
        completedCount: count(doneRows),
        cancelledCount: count(cancelledRows),

        totalAmount: sum(stats),
        activeAmount: sum(activeRows),
        completedAmount: sum(doneRows),
        pipelineAmount: sum(pipelineRows),
        cancelledAmount: sum(cancelledRows),
      };
    });
  },
);
