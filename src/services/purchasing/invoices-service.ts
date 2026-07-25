import { prisma } from "@/lib/core/prisma";
import { logActivity } from "@/lib/tools/audit";
import { addDays } from "date-fns";
import {
  PurchaseInvoiceStatus,
  Prisma,
  NotificationType,
} from "@prisma/client";
import { CreatePurchaseInvoiceValues } from "@/lib/schemas/purchasing";
import { AutoJournalService } from "../finance/auto-journal-service";
import { logger } from "@/lib/config/logger";
import {
  BusinessRuleError,
  NotFoundError,
} from "@/lib/errors/errors";
import { calculatePpn, type PpnMode } from "@/lib/utils/ppn";

/**
 * Calculate invoice total from actual GR received quantities (not PO ordered qty).
 * Sum of (receivedQty × unitPrice × discount × PPN) per PO item + flat shipping.
 * Fallback to po.totalAmount when no GR exists yet.
 */
export async function calculatePoInvoiceTotalFromReceipts(purchaseOrderId: string): Promise<number> {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      totalAmount: true,
      shippingCost: true,
      items: {
        select: {
          productVariantId: true,
          quantity: true,
          unitPrice: true,
          discountPercent: true,
          taxPercent: true,
          ppnMode: true,
        },
      },
      goodsReceipts: {
        select: {
          items: {
            select: {
              productVariantId: true,
              receivedQty: true,
            },
          },
        },
      },
    },
  });

  if (!po) return 0;
  const poTotal = typeof po.totalAmount?.toNumber === 'function' ? po.totalAmount.toNumber() : (Number(po.totalAmount) || 0);
  if (po.goodsReceipts.length === 0) return poTotal;

  // Aggregate receivedQty per productVariantId across all GRs
  const receivedMap = new Map<string, number>();
  for (const gr of po.goodsReceipts) {
    for (const item of gr.items) {
      const pvId = item.productVariantId;
      const qty = typeof item.receivedQty?.toNumber === 'function' ? item.receivedQty.toNumber() : Number(item.receivedQty);
      receivedMap.set(pvId, (receivedMap.get(pvId) ?? 0) + qty);
    }
  }

  let total = 0;
  for (const poItem of po.items) {
    const received = receivedMap.get(poItem.productVariantId) ?? 0;
    const raw = received * (typeof poItem.unitPrice?.toNumber === 'function' ? poItem.unitPrice.toNumber() : Number(poItem.unitPrice));
    const discPct = typeof poItem.discountPercent?.toNumber === 'function' ? poItem.discountPercent.toNumber() : (Number(poItem.discountPercent) || 0);
    const discount = raw * (discPct / 100);
    const afterDiscount = raw - discount;
    const taxPct = typeof poItem.taxPercent?.toNumber === 'function' ? poItem.taxPercent.toNumber() : (Number(poItem.taxPercent) || 0);
    const ppnRes = calculatePpn(afterDiscount, taxPct, poItem.ppnMode as PpnMode);
    total += ppnRes.total;
  }

  // Add flat shipping cost once
  const shipCost = typeof po.shippingCost?.toNumber === 'function' ? po.shippingCost.toNumber() : (Number(po.shippingCost) || 0);
  total += shipCost;

  return Math.round(total * 100) / 100;
}

export async function createInvoice(data: CreatePurchaseInvoiceValues) {
  // Priority: manualDueDate > dueDate > invoiceDate + termDays. Default 30 hari.
  const termDays = data.termOfPaymentDays ?? 30;
  let finalDueDate: Date;
  if (data.manualDueDate) {
    finalDueDate = data.manualDueDate;
  } else if (data.dueDate) {
    finalDueDate = data.dueDate;
  } else {
    finalDueDate = addDays(data.invoiceDate, termDays);
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: data.purchaseOrderId },
    select: { totalAmount: true },
  });

  if (!po) throw new NotFoundError("Purchase Order", data.purchaseOrderId);

  // Calculate total from GR received qty (fallback to PO total if no GR yet)
  const calculatedTotal = await calculatePoInvoiceTotalFromReceipts(data.purchaseOrderId);

  const invoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: data.invoiceNumber,
      purchaseOrderId: data.purchaseOrderId,
      invoiceDate: data.invoiceDate,
      dueDate: finalDueDate,
      termOfPaymentDays: termDays,
      totalAmount: calculatedTotal,
      status: PurchaseInvoiceStatus.UNPAID,
    },
  });

  // Auto-Journaling Trigger
  await AutoJournalService.handlePurchaseInvoiceCreated(invoice.id).catch(
    (err) => {
      logger.error("Auto-Journal failed for purchase invoice", {
        error: err,
        module: "PurchasingInvoicesService",
      });
    },
  );

  return invoice;
}

export async function recordPayment(
  id: string,
  amount: number,
  userId: string,
  options?: {
    paymentDate?: Date;
    method?: string;
    notes?: string;
    referenceNumber?: string | null;
    destinationBank?: string | null;
  },
) {
  return await prisma.$transaction(async (tx) => {
    const invoice = await tx.purchaseInvoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundError("Purchase Invoice", id);

    // Prevent payment on already paid invoices
    if (invoice.status === PurchaseInvoiceStatus.PAID) {
      throw new BusinessRuleError(
        "Invoice is already fully paid.",
        { invoiceId: id, status: invoice.status },
        "ALREADY_PAID",
      );
    }

    // Validate payment amount does not exceed remaining balance
    const remainingBalance =
      invoice.totalAmount.toNumber() - invoice.paidAmount.toNumber();
    if (amount > remainingBalance) {
      throw new BusinessRuleError(
        `Payment amount (${amount}) exceeds remaining balance (${remainingBalance})`,
        { amount, remainingBalance, invoiceId: id },
        "PAYMENT_EXCEEDS_BALANCE",
      );
    }

    const { getNextSequence } = await import("@/lib/utils/sequence");
    const { normalizePaymentMethodFields } = await import(
      "@/lib/finance/payment-methods"
    );

    const paymentFields = normalizePaymentMethodFields({
      method: options?.method || "Transfer BCA",
      referenceNumber: options?.referenceNumber,
      destinationBank: options?.destinationBank,
    });

    const newPaidAmount = invoice.paidAmount.toNumber() + amount;
    let status: PurchaseInvoiceStatus = PurchaseInvoiceStatus.PARTIAL;

    if (newPaidAmount >= invoice.totalAmount.toNumber()) {
      status = PurchaseInvoiceStatus.PAID;
    }

    const paymentNumber = await getNextSequence("PAYMENT_OUT");

    const payment = await tx.payment.create({
      data: {
        purchaseInvoiceId: id,
        paymentNumber,
        amount,
        paymentDate: options?.paymentDate || new Date(),
        method: paymentFields.method,
        notes: options?.notes,
        referenceNumber: paymentFields.referenceNumber,
        destinationBank: paymentFields.destinationBank,
      },
    });

    const updated = await tx.purchaseInvoice.update({
      where: { id },
      data: {
        paidAmount: newPaidAmount,
        status,
      },
    });

    await logActivity({
      userId,
      action: "PAYMENT_PURCHASE",
      entityType: "PurchaseInvoice",
      entityId: id,
      details: `Recorded payment of ${amount} for Invoice ${invoice.invoiceNumber}.New Status: ${status} `,
      tx,
    });

    return {
      ...updated,
      paymentId: payment.id,
    };
  });
}

export async function getPurchaseInvoiceById(id: string) {
  return await prisma.purchaseInvoice.findUnique({
    where: { id },
    include: {
      purchaseOrder: {
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          supplier: { select: { name: true, code: true } },
          items: {
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              subtotal: true,
              discountPercent: true,
              taxPercent: true,
              taxAmount: true,
              productVariant: {
                select: {
                  id: true,
                  name: true,
                  skuCode: true,
                  primaryUnit: true,
                },
              },
            },
            orderBy: { id: "asc" },
          },
        },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
      },
    },
  });
}

export async function getPurchaseInvoices(dateRange?: {
  startDate?: Date;
  endDate?: Date;
}) {
  const where: Prisma.PurchaseInvoiceWhereInput = {};
  if (dateRange?.startDate && dateRange?.endDate) {
    where.invoiceDate = {
      gte: dateRange.startDate,
      lte: dateRange.endDate,
    };
  }

  return await prisma.purchaseInvoice.findMany({
    where,
    include: {
      purchaseOrder: {
        select: {
          orderNumber: true,
          supplier: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Purchase invoices eligible for supplier payment recording.
 *
 * Source of truth: outstanding balance (totalAmount - paidAmount) > 0.
 * Includes UNPAID, PARTIAL, OVERDUE, and any non-cancelled invoice that still
 * has a remaining balance (e.g. DRAFT bills that were never flipped to UNPAID).
 * Excludes CANCELLED. Fully settled invoices (outstanding = 0) are excluded
 * regardless of status.
 */
export async function getOutstandingPurchaseInvoices() {
  const { toDecimalNumber } = await import("@/lib/utils/utils");

  const invoices = await prisma.purchaseInvoice.findMany({
    where: {
      status: { not: PurchaseInvoiceStatus.CANCELLED },
    },
    select: {
      id: true,
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
      invoiceDate: true,
      dueDate: true,
      termOfPaymentDays: true,
      purchaseOrder: {
        select: {
          orderNumber: true,
          supplier: { select: { name: true } },
        },
      },
    },
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
  });

  return invoices.filter((inv) => {
    const outstanding =
      toDecimalNumber(inv.totalAmount) - toDecimalNumber(inv.paidAmount);
    return outstanding > 0;
  });
}

export async function generateBillNumber(): Promise<string> {
  const dateStr = new Date().getFullYear().toString();
  const prefix = `BILL - ${dateStr} -`;

  const lastBill = await prisma.purchaseInvoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
  });

  let nextSequence = 1;
  if (lastBill) {
    const parts = lastBill.invoiceNumber.split("-");
    const lastSeq = parseInt(parts[2]);
    if (!isNaN(lastSeq)) {
      nextSequence = lastSeq + 1;
    }
  }

  return `${prefix}${nextSequence.toString().padStart(4, "0")} `;
}

export async function createDraftBillFromPo(
  purchaseOrderId: string,
  userId: string,
) {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      totalAmount: true,
      orderNumber: true,
      status: true,
      supplier: { select: { paymentTermDays: true } },
    },
  });

  if (!po || !po.totalAmount) return;

  // Calculate total from GR received qty
  const calculatedTotal = await calculatePoInvoiceTotalFromReceipts(purchaseOrderId);

  const existing = await prisma.purchaseInvoice.findFirst({
    where: { purchaseOrderId },
  });

  // Upsert: if invoice exists, sync totalAmount from GR; otherwise create new
  if (existing) {
    const existingTotal = existing.totalAmount.toNumber();
    if (Math.abs(existingTotal - calculatedTotal) > 0.01) {
      await prisma.purchaseInvoice.update({
        where: { id: existing.id },
        data: { totalAmount: calculatedTotal },
      });
      await logActivity({
        userId,
        action: "SYNC_BILL_FROM_GR",
        entityType: "PurchaseInvoice",
        entityId: existing.id,
        details: `Bill ${existing.invoiceNumber} total updated from ${existingTotal} to ${calculatedTotal} based on GR received quantities`,
      });
    }
    return existing;
  }

  // Create new bill
  const rawTerm = po.supplier?.paymentTermDays;
  const termOfPaymentDays =
    rawTerm != null && rawTerm >= 0 && rawTerm <= 365 ? rawTerm : 30;
  const invoiceNumber = await generateBillNumber();
  const invoiceDate = new Date();
  const dueDate = addDays(invoiceDate, termOfPaymentDays);

  // Set status to UNPAID if PO is RECEIVED or PARTIAL_RECEIVED, otherwise DRAFT
  const status =
    po.status === "RECEIVED" || po.status === "PARTIAL_RECEIVED"
      ? PurchaseInvoiceStatus.UNPAID
      : PurchaseInvoiceStatus.DRAFT;

  const invoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber,
      purchaseOrderId,
      invoiceDate,
      dueDate,
      termOfPaymentDays,
      totalAmount: calculatedTotal,
      status,
      notes: `System generated bill for PO ${po.orderNumber} (based on GR received quantities)`,
    },
  });

  await logActivity({
    userId,
    action: "AUTO_GENERATE_BILL",
    entityType: "PurchaseInvoice",
    entityId: invoice.id,
    details: `Automated bill ${invoiceNumber} generated for PO ${po.orderNumber} with status ${status} (total from GR: ${calculatedTotal})`,
  });

  // Auto-Journaling Trigger
  await AutoJournalService.handlePurchaseInvoiceCreated(invoice.id).catch(
    (err) => {
      logger.error("Auto-Journal failed for automated bill", {
        error: err,
        module: "PurchasingInvoicesService",
      });
    },
  );

  return invoice;
}

export async function updatePurchaseInvoiceDueDate(
  id: string,
  data: { dueDate?: Date; termOfPaymentDays?: number; invoiceDate?: Date },
  userId: string,
) {
  const existing = await prisma.purchaseInvoice.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Purchase Invoice", id);

  if (existing.status === PurchaseInvoiceStatus.PAID) {
    throw new BusinessRuleError("Tidak dapat mengubah tanggal jatuh tempo invoice yang sudah LUNAS");
  }

  let finalDueDate = data.dueDate;
  if (!finalDueDate) {
    const invDate = data.invoiceDate ?? existing.invoiceDate;
    const term = data.termOfPaymentDays ?? existing.termOfPaymentDays;
    finalDueDate = addDays(invDate, term);
  }

  const updated = await prisma.purchaseInvoice.update({
    where: { id },
    data: {
      ...(data.invoiceDate && { invoiceDate: data.invoiceDate }),
      dueDate: finalDueDate,
      ...(data.termOfPaymentDays != null && { termOfPaymentDays: data.termOfPaymentDays }),
    },
  });

  await logActivity({
    userId,
    action: "UPDATE_PURCHASE_INVOICE_DUE_DATE",
    entityType: "PurchaseInvoice",
    entityId: id,
    details: `Due date changed to ${finalDueDate.toISOString()} term ${updated.termOfPaymentDays} days`,
  });

  return updated;
}

export async function checkOverduePurchasingInvoices() {
  const { NotificationService } =
    await import("@/services/core/notification-service");
  const overdueInvoices = await prisma.purchaseInvoice.findMany({
    where: {
      dueDate: { lt: new Date() },
      status: {
        in: [PurchaseInvoiceStatus.UNPAID, PurchaseInvoiceStatus.PARTIAL],
      },
    },
    include: { purchaseOrder: { select: { orderNumber: true } } },
  });

  if (overdueInvoices.length === 0) return;

  const targetUsers = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  if (targetUsers.length > 0) {
    const inputs = overdueInvoices
      .map((inv) => {
        return targetUsers.map((u) => ({
          userId: u.id,
          type: "OVERDUE_AP" as NotificationType,
          title: "Overdue Purchase Invoice",
          message: `Invoice ${inv.invoiceNumber} (PO ${inv.purchaseOrder.orderNumber}) is overdue since ${inv.dueDate?.toLocaleDateString() || "Unknown"}. amount due: ${inv.totalAmount.toNumber() - inv.paidAmount.toNumber()}`,
          link: `/admin/purchasing/invoices/${inv.id}`,
          entityType: "PurchaseInvoice",
          entityId: inv.id,
        }));
      })
      .flat();

    await NotificationService.createBulkNotifications(inputs);
  }
}
