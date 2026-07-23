"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  createGoodsReceiptSchema,
  createPurchaseInvoiceSchema,
  createWalkInReceiptSchema,
} from "@/lib/schemas/purchasing";
import { PurchaseService } from "@/services/purchasing/purchase-service";
import { requireAuth } from "@/lib/tools/auth-checks";
import { revalidatePath } from "next/cache";
import {
  CreatePurchaseOrderValues,
  UpdatePurchaseOrderValues,
  CreateGoodsReceiptValues,
  CreatePurchaseInvoiceValues,
  CreatePurchaseRequestValues,
  CreateWalkInReceiptValues,
  createPurchaseRequestSchema,
} from "@/lib/schemas/purchasing";
import { PurchaseOrderStatus } from "@prisma/client";
import { serializeData } from "@/lib/utils/utils";
import { AutoJournalService } from "@/services/finance/auto-journal-service";
import { logActivity } from "@/lib/tools/audit";
import { logger } from "@/lib/config/logger";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";

export const createPurchaseOrder = withTenant(
  async function createPurchaseOrder(formData: CreatePurchaseOrderValues) {
    return safeAction(async () => {
      const session = await requireAuth();
      const validated = createPurchaseOrderSchema.parse(formData);

      const order = await PurchaseService.createOrder(
        validated,
        session.user.id,
      );

      await logActivity({
        userId: session.user.id,
        action: "CREATE_PURCHASE_ORDER",
        entityType: "PurchaseOrder",
        entityId: order.id,
        details: `Created Purchase Order ${order.orderNumber}`,
      });

      revalidatePath("/purchasing/orders");
      return serializeData(order);
    });
  },
);

export const createManualPurchaseRequest = withTenant(
  async function createManualPurchaseRequest(
    data: CreatePurchaseRequestValues,
  ) {
    return safeAction(async () => {
      const session = await requireAuth();
      const validated = createPurchaseRequestSchema.parse(data);

      const pr = await PurchaseService.createPurchaseRequest(
        validated,
        session.user.id,
      );

      revalidatePath("/purchasing/requests");
      return serializeData(pr);
    });
  },
);

export const updatePurchaseOrder = withTenant(
  async function updatePurchaseOrder(formData: UpdatePurchaseOrderValues) {
    return safeAction(async () => {
      const session = await requireAuth();
      const validated = updatePurchaseOrderSchema.parse(formData);

      const order = await PurchaseService.updateOrder(validated);

      await logActivity({
        userId: session.user.id,
        action: "UPDATE_PURCHASE_ORDER",
        entityType: "PurchaseOrder",
        entityId: order.id,
        details: `Updated Purchase Order ${order.orderNumber}`,
      });

      revalidatePath("/purchasing/orders");
      revalidatePath(`/purchasing/orders/${validated.id}`);
      return serializeData(order);
    });
  },
);

export const createGoodsReceipt = withTenant(async function createGoodsReceipt(
  formData: CreateGoodsReceiptValues,
) {
  return safeAction(async () => {
    const session = await requireAuth();
    const validated = createGoodsReceiptSchema.parse(formData);

    const receipt = await PurchaseService.createGoodsReceipt(
      validated,
      session.user.id,
    );

    revalidatePath("/purchasing/orders");
    revalidatePath(`/purchasing/orders/${validated.purchaseOrderId}`);
    revalidatePath("/warehouse/incoming");
    revalidatePath("/warehouse/incoming/history");
    revalidatePath(`/warehouse/incoming/create-receipt`);
    revalidatePath("/warehouse/inventory");
    return serializeData(receipt);
  });
});

export const createWalkInGoodsReceipt = withTenant(
  async function createWalkInGoodsReceipt(formData: CreateWalkInReceiptValues) {
    return safeAction(async () => {
      const session = await requireAuth();
      const validated = createWalkInReceiptSchema.parse(formData);

      const result = await PurchaseService.createWalkInReceipt(
        validated,
        session.user.id,
      );

      await logActivity({
        userId: session.user.id,
        action: "CREATE_WALK_IN_RECEIPT",
        entityType: "GoodsReceipt",
        entityId: result.goodsReceipt.id,
        details: `Walk-in GR ${result.goodsReceipt.receiptNumber} + PO ${result.purchaseOrder.orderNumber} (nota ${validated.supplierRefNo})`,
      });

      revalidatePath("/warehouse/incoming");
      revalidatePath("/warehouse/incoming/history");
      revalidatePath("/warehouse/incoming/from-nota");
      revalidatePath("/warehouse/inventory");
      revalidatePath("/purchasing/orders");
      revalidatePath(`/purchasing/orders/${result.purchaseOrder.id}`);

      return serializeData({
        goodsReceipt: result.goodsReceipt,
        purchaseOrder: result.purchaseOrder,
      });
    });
  },
);

export const createPurchaseInvoice = withTenant(
  async function createPurchaseInvoice(formData: CreatePurchaseInvoiceValues) {
    return safeAction(async () => {
      await requireAuth();
      const validated = createPurchaseInvoiceSchema.parse(formData);

      const invoice = await PurchaseService.createInvoice(validated);

      revalidatePath("/finance/invoices/purchase");
      revalidatePath(`/purchasing/orders/${validated.purchaseOrderId}`);
      revalidatePath(`/purchasing/orders/${validated.purchaseOrderId}`);

      // Auto-Journal: Purchase Invoice
      await AutoJournalService.handlePurchaseInvoiceCreated(invoice.id).catch(
        (error) => {
          logger.error("Auto-Journal failed for purchase invoice", {
            error,
            module: "AutoJournalService",
          });
        },
      );

      return serializeData(invoice);
    });
  },
);

export const recordPurchasePayment = withTenant(
  async function recordPurchasePayment(
    id: string,
    amount: number,
    options?: {
      paymentDate?: Date | string;
      method?: string;
      notes?: string;
      referenceNumber?: string;
      destinationBank?: string;
    },
  ) {
    return safeAction(async () => {
      const session = await requireAuth();
      const paymentDate = options?.paymentDate
        ? new Date(options.paymentDate)
        : new Date();
      const method = options?.method || "Transfer BCA";

      try {
        const updated = await PurchaseService.recordPayment(
          id,
          amount,
          session.user.id,
          {
            paymentDate,
            method,
            notes: options?.notes,
            referenceNumber: options?.referenceNumber,
            destinationBank: options?.destinationBank,
          },
        );

        revalidatePath("/finance/invoices/purchase");
        revalidatePath(`/finance/invoices/${id}`);
        revalidatePath(`/finance/invoices/${id}`);

        // Auto-Journal: Purchase Payment
        await AutoJournalService.handlePurchasePayment(
          updated.paymentId,
          amount,
          method,
        ).catch((error) => {
          logger.error("Auto-Journal failed for purchase payment", {
            error,
            invoiceId: id,
            module: "AutoJournalService",
          });
        });

        return serializeData(updated);
      } catch (error) {
        // Pass through validation errors with specific messages
        if (error instanceof Error && error.message.includes('exceeds')) {
          throw new BusinessRuleError(error.message);
        }
        throw error;
      }
    });
  },
);

export const updatePurchaseOrderStatus = withTenant(
  async function updatePurchaseOrderStatus(
    id: string,
    status: PurchaseOrderStatus,
  ) {
    return safeAction(async () => {
      const session = await requireAuth();
      const order = await PurchaseService.updateOrderStatus(
        id,
        status,
        session.user.id,
      );

      await logActivity({
        userId: session.user.id,
        action: `UPDATE_PO_STATUS`,
        entityType: "PurchaseOrder",
        entityId: order.id,
        details: `Status changed to ${status}`,
      });

      revalidatePath("/purchasing/orders");
      revalidatePath(`/purchasing/orders/${id}`);
      return serializeData(order);
    });
  },
);

export const deletePurchaseOrder = withTenant(
  async function deletePurchaseOrder(id: string) {
    return safeAction(async () => {
      const session = await requireAuth();

      try {
        const result = await PurchaseService.deleteOrder(id, session.user.id);
        revalidatePath("/purchasing/orders");
        revalidatePath("/purchasing/orders");
        return { orderNumber: result.orderNumber };
      } catch (error) {
        throw new BusinessRuleError(
          error instanceof Error ? error.message : "Failed to delete order",
        );
      }
    });
  },
);

export const getPurchaseOrders = withTenant(
  async function getPurchaseOrders(filters?: {
    supplierId?: string;
    status?: PurchaseOrderStatus;
  }) {
    return safeAction(async () => {
      await requireAuth();
      const orders = await PurchaseService.getPurchaseOrders(filters);
      return serializeData(orders);
    });
  },
);

export const getPurchaseOrderById = withTenant(
  async function getPurchaseOrderById(id: string) {
    return safeAction(async () => {
      await requireAuth();
      const order = await PurchaseService.getPurchaseOrderById(id);
      return serializeData(order);
    });
  },
);

export const getGoodsReceiptById = withTenant(
  async function getGoodsReceiptById(id: string) {
    return safeAction(async () => {
      await requireAuth();
      const receipt = await PurchaseService.getGoodsReceiptById(id);
      return serializeData(receipt);
    });
  },
);

export const getGoodsReceipts = withTenant(async function getGoodsReceipts() {
  return safeAction(async () => {
    await requireAuth();
    const receipts = await PurchaseService.getGoodsReceipts();
    return serializeData(receipts);
  });
});

export const getPurchaseInvoiceById = withTenant(
  async function getPurchaseInvoiceById(id: string) {
    return safeAction(async () => {
      await requireAuth();
      const invoice = await PurchaseService.getPurchaseInvoiceById(id);
      return serializeData(invoice);
    });
  },
);

export const getPurchaseInvoices = withTenant(
  async function getPurchaseInvoices() {
    return safeAction(async () => {
      await requireAuth();
      const invoices = await PurchaseService.getPurchaseInvoices();
      return serializeData(invoices);
    });
  },
);

export const getPurchaseRequests = withTenant(
  async function getPurchaseRequests(filters?: {
    status?: "OPEN" | "APPROVED" | "CONVERTED" | "REJECTED";
  }) {
    return safeAction(async () => {
      await requireAuth();
      const requests = await prisma.purchaseRequest.findMany({
        where: filters?.status ? { status: filters.status } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          items: {
            include: {
              productVariant: {
                include: { product: true },
              },
            },
          },
          salesOrder: {
            select: { orderNumber: true },
          },
          createdBy: {
            select: { name: true },
          },
        },
      });
      return serializeData(requests);
    });
  },
);

export const consolidatePurchaseRequests = withTenant(
  async function consolidatePurchaseRequests(
    requestIds: string[],
    supplierId: string,
  ) {
    return safeAction(async () => {
      const session = await requireAuth();
      try {
        const po = await PurchaseService.consolidateRequestsToOrder(
          requestIds,
          supplierId,
          session.user.id,
        );
        revalidatePath("/purchasing/requests");
        revalidatePath("/purchasing/orders");
        return serializeData(po);
      } catch (error) {
        throw new BusinessRuleError(
          error instanceof Error
            ? error.message
            : "Failed to consolidate requests",
        );
      }
    });
  },
);

export const updatePurchaseInvoiceDueDate = withTenant(
  async function updatePurchaseInvoiceDueDate(
    id: string,
    data: { dueDate?: Date | string; termOfPaymentDays?: number; invoiceDate?: Date | string },
  ) {
    return safeAction(async () => {
      const session = await requireAuth();
      const parsed = {
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
        termOfPaymentDays: data.termOfPaymentDays,
      };
      const updated = await PurchaseService.updatePurchaseInvoiceDueDate(id, parsed, session.user.id);
      revalidatePath("/finance/invoices/purchase");
      revalidatePath(`/finance/invoices/purchase/${id}`);
      revalidatePath("/purchasing/orders");
      return serializeData(updated);
    });
  },
);
