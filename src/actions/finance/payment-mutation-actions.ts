"use server";

import {
  InvoiceStatus,
  PurchaseInvoiceStatus,
  ReferenceType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { logger } from "@/lib/config/logger";
import {
  BusinessRuleError,
  NotFoundError,
  safeAction,
} from "@/lib/errors/errors";
import { hasAnyRole } from "@/lib/auth/roles";
import { requireAuth } from "@/lib/tools/auth-checks";
import { logActivity } from "@/lib/tools/audit";
import { formatRupiah } from "@/lib/utils/utils";
import { AutoJournalService } from "@/services/finance/auto-journal-service";
import { PurchaseService } from "@/services/purchasing/purchase-service";
import { normalizePaymentMethodFields } from "@/lib/finance/payment-methods";

export const recordCustomerPayment = withTenant(
  async function recordCustomerPayment(data: {
    invoiceId: string;
    amount: number;
    paymentDate: Date | string;
    method: string;
    notes?: string;
    referenceNumber?: string;
    destinationBank?: string;
  }) {
    return safeAction(async () => {
      const session = await requireAuth();

      try {
        let paymentFields;
        try {
          paymentFields = normalizePaymentMethodFields({
            method: data.method,
            referenceNumber: data.referenceNumber,
            destinationBank: data.destinationBank,
          });
        } catch (validationError) {
          throw new BusinessRuleError(
            validationError instanceof Error
              ? validationError.message
              : "Data metode pembayaran tidak valid.",
          );
        }

        const invoice = await prisma.invoice.findUnique({
          where: { id: data.invoiceId },
        });

        if (!invoice) {
          throw new NotFoundError("Invoice", data.invoiceId);
        }

        // Validate payment date falls in an open fiscal period
        const { isPeriodOpen } =
          await import("@/services/accounting/periods-service");
        const paymentDate = new Date(data.paymentDate);
        const isOpen = await isPeriodOpen(paymentDate);
        if (!isOpen) {
          throw new BusinessRuleError(
            "Payment date falls in a closed fiscal period",
          );
        }

        const totalAmount = Number(invoice.totalAmount);
        const currentPaid = Number(invoice.paidAmount);
        const remainingBalance = totalAmount - currentPaid;

        // Validate: invoice not already fully paid
        if (remainingBalance <= 0) {
          throw new BusinessRuleError(
            `Invoice ${invoice.invoiceNumber} sudah lunas. Tidak bisa menambah pembayaran.`,
          );
        }

        // Validate: payment amount does not exceed remaining balance
        if (data.amount > remainingBalance) {
          throw new BusinessRuleError(
            `Pembayaran ${formatRupiah(data.amount)} melebihi sisa tagihan ${formatRupiah(remainingBalance)}. Sisa yang bisa dibayar: ${formatRupiah(remainingBalance)}`,
          );
        }

        // Validate: check for existing payments to prevent duplicates
        const existingPayments = await prisma.payment.findMany({
          where: { invoiceId: data.invoiceId },
          orderBy: { paymentDate: 'desc' },
        });

        if (existingPayments.length > 0) {
          const totalExistingPayments = existingPayments.reduce(
            (sum, p) => sum + Number(p.amount),
            0,
          );
          logger.warn("Invoice already has payment records", {
            invoiceId: data.invoiceId,
            existingPayments: existingPayments.length,
            totalExistingPayments,
            newPaymentAmount: data.amount,
            module: "FinancePaymentActions",
          });
        }

        // Validate: check for existing journal entries for this invoice
        const existingJournals = await prisma.journalEntry.findMany({
          where: {
            referenceId: data.invoiceId,
            referenceType: "SALES_INVOICE",
            status: "POSTED",
          },
        });

        if (existingJournals.length > 0) {
          logger.warn("Invoice already has journal entries", {
            invoiceId: data.invoiceId,
            journalCount: existingJournals.length,
            journalNumbers: existingJournals.map(j => j.entryNumber),
            module: "FinancePaymentActions",
          });
        }

        const newPaidAmount = currentPaid + data.amount;
        const newStatus =
          newPaidAmount >= totalAmount
            ? InvoiceStatus.PAID
            : InvoiceStatus.PARTIAL;

        const { getNextSequence } = await import("@/lib/utils/sequence");
        const paymentNumber = await getNextSequence("PAYMENT_IN");

        const payment = await prisma.$transaction(async (tx) => {
          const createdPayment = await tx.payment.create({
            data: {
              paymentNumber,
              paymentDate: new Date(data.paymentDate),
              amount: data.amount,
              method: paymentFields.method,
              notes: data.notes,
              referenceNumber: paymentFields.referenceNumber,
              destinationBank: paymentFields.destinationBank,
              invoiceId: data.invoiceId,
            },
          });

          await tx.invoice.update({
            where: { id: data.invoiceId },
            data: {
              paidAmount: newPaidAmount,
              status: newStatus,
            },
          });

          return createdPayment;
        });

        // Auto-journal must be called after transaction commits to avoid long-running transactions.
        // If it fails, payment is recorded but no journal entry exists — this is logged and can be
        // reconciled manually. Moving this inside the transaction would hold locks too long.
        try {
          await AutoJournalService.handleSalesPayment(
            payment.id,
            data.amount,
            paymentFields.method,
          );
        } catch (journalError) {
          logger.error("Auto-journal failed after payment recorded", {
            error: journalError,
            paymentId: payment.id,
            module: "FinancePaymentActions",
          });
        }

        await logActivity({
          userId: session.user.id,
          action: "RECORD_CUSTOMER_PAYMENT",
          entityType: "Invoice",
          entityId: data.invoiceId,
          details: `Recorded payment of ${data.amount} for Sales Invoice ${data.invoiceId}`,
        });

        revalidatePath("/finance/payments/received");
        revalidatePath("/finance/invoices/sales");

        return { message: "Payment recorded successfully" };
      } catch (error) {
        if (
          error instanceof BusinessRuleError ||
          error instanceof NotFoundError
        )
          throw error;
        logger.error("Failed to record customer payment", {
          error,
          invoiceId: data.invoiceId,
          module: "FinancePaymentActions",
        });
        throw new BusinessRuleError(
          "Failed to record customer payment. Please ensure input is valid.",
        );
      }
    });
  },
);

export const recordSupplierPayment = withTenant(
  async function recordSupplierPayment(data: {
    invoiceId: string;
    amount: number;
    paymentDate: Date | string;
    method: string;
    notes?: string;
    referenceNumber?: string;
    destinationBank?: string;
  }) {
    return safeAction(async () => {
      const session = await requireAuth();

      try {
        let paymentFields;
        try {
          paymentFields = normalizePaymentMethodFields({
            method: data.method,
            referenceNumber: data.referenceNumber,
            destinationBank: data.destinationBank,
          });
        } catch (validationError) {
          throw new BusinessRuleError(
            validationError instanceof Error
              ? validationError.message
              : "Data metode pembayaran tidak valid.",
          );
        }

        // Validate payment date falls in an open fiscal period
        const { isPeriodOpen } =
          await import("@/services/accounting/periods-service");
        const paymentDate = new Date(data.paymentDate);
        const isOpen = await isPeriodOpen(paymentDate);
        if (!isOpen) {
          throw new BusinessRuleError(
            "Payment date falls in a closed fiscal period",
          );
        }

        // Validate: check for existing payments to prevent duplicates
        const existingPayments = await prisma.payment.findMany({
          where: { purchaseInvoiceId: data.invoiceId },
          orderBy: { paymentDate: 'desc' },
        });

        if (existingPayments.length > 0) {
          const totalExistingPayments = existingPayments.reduce(
            (sum, p) => sum + Number(p.amount),
            0,
          );
          logger.warn("Purchase invoice already has payment records", {
            invoiceId: data.invoiceId,
            existingPayments: existingPayments.length,
            totalExistingPayments,
            newPaymentAmount: data.amount,
            module: "FinancePaymentActions",
          });
        }

        // Validate: check for existing journal entries for this invoice
        const existingJournals = await prisma.journalEntry.findMany({
          where: {
            referenceId: data.invoiceId,
            referenceType: "PURCHASE_INVOICE",
            status: "POSTED",
          },
        });

        if (existingJournals.length > 0) {
          logger.warn("Purchase invoice already has journal entries", {
            invoiceId: data.invoiceId,
            journalCount: existingJournals.length,
            journalNumbers: existingJournals.map(j => j.entryNumber),
            module: "FinancePaymentActions",
          });
        }

        const updated = await PurchaseService.recordPayment(
          data.invoiceId,
          data.amount,
          session.user.id,
          {
            paymentDate: new Date(data.paymentDate),
            method: paymentFields.method,
            notes: data.notes,
            referenceNumber: paymentFields.referenceNumber,
            destinationBank: paymentFields.destinationBank,
          },
        );

        try {
          await AutoJournalService.handlePurchasePayment(
            updated.paymentId,
            data.amount,
            paymentFields.method,
          );
        } catch (journalError) {
          logger.error("Auto-journal failed after purchase payment recorded", {
            error: journalError,
            paymentId: updated.paymentId,
            module: "FinancePaymentActions",
          });
        }

        await logActivity({
          userId: session.user.id,
          action: "RECORD_SUPPLIER_PAYMENT",
          entityType: "PurchaseInvoice",
          entityId: data.invoiceId,
          details: `Recorded payment of ${data.amount} for Purchase Invoice ${data.invoiceId}`,
        });

        revalidatePath("/finance/payments/sent");
        revalidatePath("/finance/invoices/purchase");

        return { message: "Payment recorded successfully" };
      } catch (error) {
        if (
          error instanceof BusinessRuleError ||
          error instanceof NotFoundError
        )
          throw error;

        // Pass through validation errors with specific messages
        if (error instanceof Error && error.message.includes('exceeds')) {
          throw new BusinessRuleError(error.message);
        }

        logger.error("Failed to record supplier payment", {
          error,
          invoiceId: data.invoiceId,
          module: "FinancePaymentActions",
        });
        throw new BusinessRuleError(
          "Failed to record supplier payment. Please ensure input is valid.",
        );
      }
    });
  },
);

export const deletePayment = withTenant(async function deletePayment(
  id: string,
) {
  return safeAction(async () => {
    const authSession = await requireAuth();
    if (!hasAnyRole(authSession.user, ["ADMIN", "FINANCE"])) {
      throw new BusinessRuleError(
        "Only ADMIN or FINANCE roles can delete payments",
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id },
          include: {
            invoice: true,
            purchaseInvoice: true,
          },
        });

        if (!payment) throw new NotFoundError("Payment record", id);

        // Validate all associated journal entries are in open periods
        const { isPeriodOpen } =
          await import("@/services/accounting/periods-service");
        const refType = payment.invoiceId
          ? ReferenceType.SALES_PAYMENT
          : ReferenceType.PURCHASE_PAYMENT;
        const journals = await tx.journalEntry.findMany({
          where: { referenceId: id, referenceType: refType },
        });
        for (const journal of journals) {
          const isOpen = await isPeriodOpen(journal.entryDate, tx);
          if (!isOpen) {
            throw new BusinessRuleError(
              `Cannot delete payment: journal entry ${journal.entryNumber} is in a closed fiscal period`,
            );
          }
        }

        if (payment.invoiceId && payment.invoice) {
          const newPaid =
            Number(payment.invoice.paidAmount) - Number(payment.amount);
          const total = Number(payment.invoice.totalAmount);

          let newStatus: InvoiceStatus = InvoiceStatus.PARTIAL;
          if (newPaid <= 0) {
            newStatus = InvoiceStatus.UNPAID;
          }

          if (
            newPaid < total &&
            payment.invoice.dueDate &&
            new Date(payment.invoice.dueDate) < new Date()
          ) {
            newStatus = InvoiceStatus.OVERDUE;
          }

          await tx.invoice.update({
            where: { id: payment.invoiceId },
            data: {
              paidAmount: newPaid,
              status: newStatus,
            },
          });
        } else if (payment.purchaseInvoiceId && payment.purchaseInvoice) {
          const newPaid =
            Number(payment.purchaseInvoice.paidAmount) - Number(payment.amount);
          const total = Number(payment.purchaseInvoice.totalAmount);

          let newStatus: PurchaseInvoiceStatus = PurchaseInvoiceStatus.PARTIAL;
          if (newPaid <= 0) {
            newStatus = PurchaseInvoiceStatus.UNPAID;
          }

          if (
            newPaid < total &&
            payment.purchaseInvoice.dueDate &&
            new Date(payment.purchaseInvoice.dueDate) < new Date()
          ) {
            newStatus = PurchaseInvoiceStatus.OVERDUE;
          }

          await tx.purchaseInvoice.update({
            where: { id: payment.purchaseInvoiceId },
            data: {
              paidAmount: newPaid,
              status: newStatus,
            },
          });
        }

        await tx.journalLine.deleteMany({
          where: { journalEntry: { referenceId: id, referenceType: refType } },
        });
        await tx.journalEntry.deleteMany({
          where: { referenceId: id, referenceType: refType },
        });

        await tx.payment.delete({ where: { id } });
      });

      await logActivity({
        userId: authSession.user.id,
        action: "DELETE_PAYMENT",
        entityType: "Payment",
        entityId: id,
        details: `Deleted payment ${id}`,
      });

      revalidatePath("/finance/payments/received");
      revalidatePath("/finance/payments/sent");
      revalidatePath("/finance/invoices/sales");
      revalidatePath("/finance/invoices/purchase");

      return { message: "Payment deleted successfully" };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error("Failed to delete payment", {
        error,
        paymentId: id,
        module: "FinancePaymentActions",
      });
      throw new BusinessRuleError(
        "Failed to delete payment. Ensure no dependent records exist.",
      );
    }
  });
});
