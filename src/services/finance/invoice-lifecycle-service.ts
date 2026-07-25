import { addDays, format } from "date-fns";
import { InvoiceStatus, JournalStatus, SalesOrderStatus } from "@prisma/client";

import { prisma } from "@/lib/core/prisma";
import { logger } from "@/lib/config/logger";
import { NotFoundError, BusinessRuleError } from "@/lib/errors/errors";
import {
  CreateInvoiceValues,
  UpdateInvoiceStatusValues,
} from "@/lib/schemas/invoice";
import { logActivity } from "@/lib/tools/audit";

import { AutoJournalService } from "./auto-journal-service";
import { calculatePpn, type PpnMode } from "@/lib/utils/ppn";

/**
 * Calculate sales invoice total from actual delivered/shipped quantities (not SO ordered qty).
 * Sum of (deliveredQty × unitPrice × discount × PPN) per SO item + shipping from DO.
 * Fallback to so.totalAmount when no shipments exist yet.
 */
export async function calculateSalesInvoiceTotalFromDelivered(salesOrderId: string): Promise<number> {
  const so = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
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
          deliveredQty: true,
        },
      },
      deliveryOrders: {
        where: { status: { in: ["SHIPPED", "DELIVERED"] } },
        select: {
          totalCharge: true,
          items: {
            select: {
              productVariantId: true,
              quantity: true,
            },
          },
        },
      },
    },
  });

  if (!so) return 0;

  // Check if any items have been delivered
  const hasDelivered = so.items.some(item => {
    const val = item.deliveredQty;
    return (typeof val?.toNumber === 'function' ? val.toNumber() : Number(val)) > 0;
  });
  if (!hasDelivered) {
    const amt = so.totalAmount;
    return (typeof amt?.toNumber === 'function' ? amt.toNumber() : Number(amt)) ?? 0;
  }

  let totalGoods = 0;
  for (const soItem of so.items) {
    const delivered = typeof soItem.deliveredQty?.toNumber === 'function' ? soItem.deliveredQty.toNumber() : Number(soItem.deliveredQty);
    const raw = delivered * (typeof soItem.unitPrice?.toNumber === 'function' ? soItem.unitPrice.toNumber() : Number(soItem.unitPrice));
    const discPct = typeof soItem.discountPercent?.toNumber === 'function' ? soItem.discountPercent.toNumber() : (Number(soItem.discountPercent) || 0);
    const discount = raw * (discPct / 100);
    const afterDiscount = raw - discount;
    const taxPct = typeof soItem.taxPercent?.toNumber === 'function' ? soItem.taxPercent.toNumber() : (Number(soItem.taxPercent) || 0);
    const ppnRes = calculatePpn(afterDiscount, taxPct, soItem.ppnMode as PpnMode);
    totalGoods += ppnRes.total;
  }

  // Shipping from DO totalCharge sum (actual shipped) or SO shippingCost fallback
  let shipping = 0;
  if (so.deliveryOrders.length > 0) {
    for (const doRecord of so.deliveryOrders) {
      const charge = doRecord.totalCharge;
      shipping += (typeof charge?.toNumber === 'function' ? charge.toNumber() : Number(charge)) ?? 0;
    }
  } else {
    const shipCost = so.shippingCost;
    shipping = (typeof shipCost?.toNumber === 'function' ? shipCost.toNumber() : Number(shipCost)) ?? 0;
  }

  return Math.round((totalGoods + shipping) * 100) / 100;
}

export async function generateInvoiceNumber(): Promise<string> {
  const dateStr = format(new Date(), "yyyyMMdd");
  const prefix = `INV-${dateStr}-`;

  const lastInvoice = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
  });

  let nextSequence = 1;
  if (lastInvoice) {
    const parts = lastInvoice.invoiceNumber.split("-");
    const lastSeq = parseInt(parts[2]);
    if (!isNaN(lastSeq)) {
      nextSequence = lastSeq + 1;
    }
  }

  return `${prefix}${nextSequence.toString().padStart(4, "0")}`;
}

export async function createInvoice(data: CreateInvoiceValues, userId: string) {
  const { salesOrderId, invoiceDate, dueDate, termOfPaymentDays, notes } = data;

  const finalDueDate = dueDate || addDays(invoiceDate, termOfPaymentDays || 0);

  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: {
      id: true,
      totalAmount: true,
      orderNumber: true,
      customerId: true,
      status: true,
    },
  });

  if (!salesOrder) {
    throw new NotFoundError("Sales Order", salesOrderId);
  }

  // ── Status gate: block invoicing for quotation/draft/cancelled ──
  const nonInvoicableStatuses: SalesOrderStatus[] = [
    SalesOrderStatus.QUOTATION,
    SalesOrderStatus.QUOTATION_SENT,
    SalesOrderStatus.QUOTATION_REJECTED,
    SalesOrderStatus.QUOTATION_EXPIRED,
    SalesOrderStatus.DRAFT,
    SalesOrderStatus.CANCELLED,
  ];
  if (nonInvoicableStatuses.includes(salesOrder.status)) {
    throw new BusinessRuleError(
      `Tidak bisa membuat invoice untuk SO status ${salesOrder.status}.`,
      { salesOrderId, status: salesOrder.status },
    );
  }

  if (!salesOrder.totalAmount) {
    throw new BusinessRuleError("Sales Order tidak memiliki total amount", { salesOrderId });
  }

  if (!salesOrder.customerId) {
    throw new BusinessRuleError(
      "Tidak dapat membuat invoice untuk Sales Order tanpa customer. Lengkapi data customer terlebih dahulu, atau gunakan Production Order untuk pembuatan stok internal.",
      { salesOrderId }
    );
  }

  // Calculate total from delivered qty (fallback to SO total if no deliveries yet)
  const calculatedTotal = await calculateSalesInvoiceTotalFromDelivered(salesOrderId);

  const invoiceNumber = await generateInvoiceNumber();

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      salesOrderId,
      invoiceDate,
      dueDate: finalDueDate,
      termOfPaymentDays: termOfPaymentDays || 0,
      totalAmount: calculatedTotal,
      paidAmount: 0,
      status: InvoiceStatus.UNPAID,
      notes,
    },
  });

  await logActivity({
    userId,
    action: "CREATE_INVOICE",
    entityType: "Invoice",
    entityId: invoice.id,
    details: `Invoice ${invoiceNumber} created for Order ${salesOrder.orderNumber} (total from delivered: ${calculatedTotal})`,
  });

  await AutoJournalService.handleSalesInvoiceCreated(invoice.id).catch(
    (error) => {
      logger.error("Failed to generate auto-journal for invoice", {
        error,
        invoiceId: invoice.id,
        module: "FinanceInvoiceService",
      });
    },
  );

  return invoice;
}

export async function updateInvoiceStatus(
  data: UpdateInvoiceStatusValues,
  userId: string,
) {
  const { id, status, paidAmount } = data;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
  });

  if (!invoice) {
    throw new NotFoundError("Invoice", id);
  }

  await prisma.invoice.update({
    where: { id },
    data: {
      status,
      ...(paidAmount !== undefined && { paidAmount }),
    },
  });

  await logActivity({
    userId,
    action: "UPDATE_INVOICE",
    entityType: "Invoice",
    entityId: id,
    details: `Invoice ${invoice.invoiceNumber} status updated to ${status}`,
  });

  let journalStatus: JournalStatus | undefined;

  switch (status) {
    case "UNPAID":
    case "PAID":
    case "PARTIAL":
    case "OVERDUE":
      journalStatus = JournalStatus.POSTED;
      break;
    case "CANCELLED":
      journalStatus = JournalStatus.VOIDED;
      break;
    case "DRAFT":
      journalStatus = JournalStatus.DRAFT;
      break;
  }

  if (journalStatus) {
    await prisma.journalEntry.updateMany({
      where: {
        referenceId: id,
        referenceType: "SALES_INVOICE",
      },
      data: {
        status: journalStatus,
      },
    });
  }
}

export async function createDraftInvoiceFromOrder(
  salesOrderId: string,
  userId: string,
) {
  const salesOrder = await prisma.salesOrder.findUnique({
    where: { id: salesOrderId },
    select: {
      id: true,
      totalAmount: true,
      orderNumber: true,
      customerId: true,
      customer: { select: { paymentTermDays: true } },
    },
  });

  if (!salesOrder || !salesOrder.totalAmount || !salesOrder.customerId) {
    return;
  }

  // Calculate total from delivered qty
  const calculatedTotal = await calculateSalesInvoiceTotalFromDelivered(salesOrderId);

  const existingInvoice = await prisma.invoice.findFirst({
    where: { salesOrderId },
  });

  // Upsert: if DRAFT invoice exists, sync totalAmount from delivered qty
  if (existingInvoice) {
    if (existingInvoice.status === "DRAFT") {
      const existingTotal = existingInvoice.totalAmount.toNumber();
      if (Math.abs(existingTotal - calculatedTotal) > 0.01) {
        await prisma.invoice.update({
          where: { id: existingInvoice.id },
          data: { totalAmount: calculatedTotal },
        });
        await logActivity({
          userId,
          action: "SYNC_INVOICE_FROM_DELIVERED",
          entityType: "Invoice",
          entityId: existingInvoice.id,
          details: `Invoice ${existingInvoice.invoiceNumber} total updated from ${existingTotal} to ${calculatedTotal} based on delivered quantities`,
        });
      }
      return { ...existingInvoice, totalAmount: { toNumber: () => calculatedTotal } as never };
    }
    if (
      existingInvoice.status === "UNPAID" ||
      existingInvoice.status === "PARTIAL" ||
      existingInvoice.status === "OVERDUE"
    ) {
      // #3: delivered increased after invoice locked — don't overwrite, but emit warning + create second DRAFT for remaining.
      // Caller (delivery commit) will log mismatch; second draft creation attempted via createSecondaryInvoiceIfNeeded below.
      const existingTotal = existingInvoice.totalAmount.toNumber();
      if (calculatedTotal > existingTotal + 0.01) {
        // There's additional delivered value not covered by existing locked invoice → create supplementary DRAFT
        const remaining = calculatedTotal - existingTotal;
        try {
          const termOfPaymentDays = salesOrder.customer?.paymentTermDays ?? 30;
          const invoiceNumber = await generateInvoiceNumber();
          const invoiceDate = new Date();
          const dueDate = addDays(invoiceDate, termOfPaymentDays);
          const supplementary = await prisma.invoice.create({
            data: {
              invoiceNumber,
              salesOrderId,
              invoiceDate,
              dueDate,
              termOfPaymentDays,
              totalAmount: remaining,
              paidAmount: 0,
              status: InvoiceStatus.DRAFT,
              notes: `Suplementer: tambahan kirim setelah invoice ${existingInvoice.invoiceNumber} (sisa ${remaining}) — SO ${salesOrder.orderNumber}`,
            },
          });
          await logActivity({
            userId,
            action: "CREATE_SUPPLEMENTARY_INVOICE",
            entityType: "Invoice",
            entityId: supplementary.id,
            details: `Supplementary invoice ${invoiceNumber} for remaining ${remaining} after ${existingInvoice.invoiceNumber} (total delivered now ${calculatedTotal})`,
          });
          await AutoJournalService.handleSalesInvoiceCreated(supplementary.id).catch((err) => {
            logger.error("Auto-Journal failed for supplementary invoice", {
              error: err,
              invoiceId: supplementary.id,
              module: "FinanceInvoiceService",
            });
          });
        } catch (e) {
          logger.error("Failed to create supplementary invoice", {
            error: e,
            salesOrderId,
            module: "FinanceInvoiceService",
          });
        }
      }
    }
    return existingInvoice;
  }

  const termOfPaymentDays = salesOrder.customer?.paymentTermDays ?? 30;
  const invoiceNumber = await generateInvoiceNumber();
  const invoiceDate = new Date();
  const dueDate = addDays(invoiceDate, termOfPaymentDays);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
      salesOrderId,
      invoiceDate,
      dueDate,
      termOfPaymentDays,
      totalAmount: calculatedTotal,
      paidAmount: 0,
      status: InvoiceStatus.DRAFT,
      notes: `System generated draft invoice for Order ${salesOrder.orderNumber} (based on delivered quantities)`,
    },
  });

  await logActivity({
    userId,
    action: "AUTO_GENERATE_INVOICE",
    entityType: "Invoice",
    entityId: invoice.id,
    details: `Automated draft invoice ${invoiceNumber} generated for shipped Order ${salesOrder.orderNumber} (total from delivered: ${calculatedTotal})`,
  });

  await AutoJournalService.handleSalesInvoiceCreated(invoice.id).catch(
    (error) => {
      logger.error("Failed to generate auto-journal for invoice", {
        error,
        invoiceId: invoice.id,
        module: "FinanceInvoiceService",
      });
    },
  );

  return invoice;
}
