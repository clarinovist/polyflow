"use server";

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { InvoiceStatus, Prisma } from "@prisma/client";
import { logger } from "@/lib/config/logger";
import {
  safeAction,
  BusinessRuleError,
  NotFoundError,
} from "@/lib/errors/errors";
import { hasAnyRole } from "@/lib/auth/roles";

export const getSalesInvoices = withTenant(
  async function getSalesInvoices(dateRange?: {
    startDate?: Date;
    endDate?: Date;
  }) {
    return safeAction(async () => {
      const where: Prisma.InvoiceWhereInput = {};
      if (dateRange?.startDate && dateRange?.endDate) {
        where.invoiceDate = {
          gte: dateRange.startDate,
          lte: dateRange.endDate,
        };
      }

      const invoices = await prisma.invoice.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          salesOrder: {
            select: {
              orderNumber: true,
              customer: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      return invoices;
    });
  },
);

export const getPurchaseInvoices = withTenant(
  async function getPurchaseInvoices() {
    return safeAction(async () => {
      const invoices = await prisma.purchaseInvoice.findMany({
        orderBy: {
          createdAt: "desc",
        },
        include: {
          purchaseOrder: {
            select: {
              orderNumber: true,
              supplier: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      return invoices;
    });
  },
);

/**
 * Outstanding AP invoices for "Catat Pembayaran Supplier" dropdown.
 * Returns every non-cancelled purchase invoice with remaining balance > 0
 * (UNPAID, PARTIAL, OVERDUE, and DRAFT-with-balance). Already serialized.
 */
export const getOutstandingPurchaseInvoices = withTenant(
  async function getOutstandingPurchaseInvoices() {
    return safeAction(async () => {
      const { getOutstandingPurchaseInvoices: fetchOutstanding } =
        await import("@/services/purchasing/invoices-service");
      const { serializeData } = await import("@/lib/utils/utils");
      const invoices = await fetchOutstanding();
      return serializeData(invoices);
    });
  },
);

export const getInvoiceStats = withTenant(async function getInvoiceStats() {
  return safeAction(async () => {
    // 1. Unpaid Amount
    const unpaid = await prisma.invoice.aggregate({
      _sum: {
        totalAmount: true,
        paidAmount: true,
      },
      where: {
        status: {
          in: ["UNPAID", "PARTIAL", "OVERDUE"] as InvoiceStatus[],
        },
      },
    });

    // Calculate actual outstanding (Total - Paid)
    const totalOutstanding =
      (Number(unpaid._sum.totalAmount) || 0) -
      (Number(unpaid._sum.paidAmount) || 0);

    // 2. Overdue Count
    const overdueCount = await prisma.invoice.count({
      where: {
        status: "OVERDUE",
      },
    });

    return {
      totalOutstanding,
      overdueCount,
    };
  });
});

export const deleteInvoice = withTenant(async function deleteInvoice(
  id: string,
  type: "AR" | "AP",
) {
  return safeAction(async () => {
    const { requireAuth } = await import("@/lib/tools/auth-checks");
    const { revalidatePath } = await import("next/cache");
    const { ReferenceType } = await import("@prisma/client");
    const { isPeriodOpen } =
      await import("@/services/accounting/periods-service");
    const { logActivity } = await import("@/lib/tools/audit");

    const session = await requireAuth();
    if (!hasAnyRole(session.user, ["ADMIN", "FINANCE"])) {
      throw new BusinessRuleError(
        "Only ADMIN or FINANCE roles can delete invoices",
      );
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (type === "AR") {
          const invoice = await tx.invoice.findUnique({
            where: { id },
            include: { payments: true },
          });

          if (!invoice) throw new NotFoundError("Sales Invoice", id);

          // Validate all associated journal entries are in open periods
          const invoiceJournals = await tx.journalEntry.findMany({
            where: {
              referenceId: invoice.id,
              referenceType: ReferenceType.SALES_INVOICE,
            },
          });
          for (const journal of invoiceJournals) {
            const isOpen = await isPeriodOpen(journal.entryDate, tx);
            if (!isOpen) {
              throw new BusinessRuleError(
                `Cannot delete invoice: journal entry ${journal.entryNumber} is in a closed fiscal period`,
              );
            }
          }

          // Find all IDs for payments associated with this invoice
          const paymentIds = invoice.payments.map((p) => p.id);

          // Validate payment journal entries are in open periods
          if (paymentIds.length > 0) {
            const paymentJournals = await tx.journalEntry.findMany({
              where: {
                referenceId: { in: paymentIds },
                referenceType: ReferenceType.SALES_PAYMENT,
              },
            });
            for (const journal of paymentJournals) {
              const isOpen = await isPeriodOpen(journal.entryDate, tx);
              if (!isOpen) {
                throw new BusinessRuleError(
                  `Cannot delete invoice: payment journal entry ${journal.entryNumber} is in a closed fiscal period`,
                );
              }
            }
          }

          // 1. Delete associated Invoice Journal Entries
          await tx.journalLine.deleteMany({
            where: {
              journalEntry: {
                referenceId: invoice.id,
                referenceType: ReferenceType.SALES_INVOICE,
              },
            },
          });
          await tx.journalEntry.deleteMany({
            where: {
              referenceId: invoice.id,
              referenceType: ReferenceType.SALES_INVOICE,
            },
          });

          // 2. Delete associated Payment Journal Entries
          if (paymentIds.length > 0) {
            await tx.journalLine.deleteMany({
              where: {
                journalEntry: {
                  referenceId: { in: paymentIds },
                  referenceType: ReferenceType.SALES_PAYMENT,
                },
              },
            });
            await tx.journalEntry.deleteMany({
              where: {
                referenceId: { in: paymentIds },
                referenceType: ReferenceType.SALES_PAYMENT,
              },
            });
          }

          // 3. Delete Payment records first (mandatory due to FK)
          await tx.payment.deleteMany({ where: { invoiceId: id } });

          // 4. Delete Invoice
          await tx.invoice.delete({ where: { id } });
        } else {
          const invoice = await tx.purchaseInvoice.findUnique({
            where: { id },
            include: { payments: true },
          });

          if (!invoice) throw new NotFoundError("Purchase Invoice", id);

          // Validate all associated journal entries are in open periods
          const invoiceJournals = await tx.journalEntry.findMany({
            where: {
              referenceId: invoice.id,
              referenceType: ReferenceType.PURCHASE_INVOICE,
            },
          });
          for (const journal of invoiceJournals) {
            const isOpen = await isPeriodOpen(journal.entryDate, tx);
            if (!isOpen) {
              throw new BusinessRuleError(
                `Cannot delete invoice: journal entry ${journal.entryNumber} is in a closed fiscal period`,
              );
            }
          }

          const paymentIds = invoice.payments.map((p) => p.id);

          // Validate payment journal entries are in open periods
          if (paymentIds.length > 0) {
            const paymentJournals = await tx.journalEntry.findMany({
              where: {
                referenceId: { in: paymentIds },
                referenceType: ReferenceType.PURCHASE_PAYMENT,
              },
            });
            for (const journal of paymentJournals) {
              const isOpen = await isPeriodOpen(journal.entryDate, tx);
              if (!isOpen) {
                throw new BusinessRuleError(
                  `Cannot delete invoice: payment journal entry ${journal.entryNumber} is in a closed fiscal period`,
                );
              }
            }
          }

          // 1. Delete associated Invoice Journal Entries
          await tx.journalLine.deleteMany({
            where: {
              journalEntry: {
                referenceId: invoice.id,
                referenceType: ReferenceType.PURCHASE_INVOICE,
              },
            },
          });
          await tx.journalEntry.deleteMany({
            where: {
              referenceId: invoice.id,
              referenceType: ReferenceType.PURCHASE_INVOICE,
            },
          });

          // 2. Delete associated Payment Journal Entries
          if (paymentIds.length > 0) {
            await tx.journalLine.deleteMany({
              where: {
                journalEntry: {
                  referenceId: { in: paymentIds },
                  referenceType: ReferenceType.PURCHASE_PAYMENT,
                },
              },
            });
            await tx.journalEntry.deleteMany({
              where: {
                referenceId: { in: paymentIds },
                referenceType: ReferenceType.PURCHASE_PAYMENT,
              },
            });
          }

          // 3. Delete Payment records
          await tx.payment.deleteMany({ where: { purchaseInvoiceId: id } });

          // 4. Reverse GoodsReceipts for linked PO (cascading revert)
          if (invoice.purchaseOrderId) {
            const { reverseAllGoodsReceiptsForPO } = await import(
              "@/services/purchasing/receipts-service"
            );
            await reverseAllGoodsReceiptsForPO(
              invoice.purchaseOrderId,
              session.user.id,
              tx,
            );
          }

          // 5. Delete Invoice
          await tx.purchaseInvoice.delete({ where: { id } });
        }
      });

      await logActivity({
        userId: session.user.id,
        action: "DELETE_INVOICE",
        entityType: type === "AR" ? "Invoice" : "PurchaseInvoice",
        entityId: id,
        details: `Deleted ${type} invoice ${id}`,
      });

      revalidatePath("/sales/invoices");
      revalidatePath("/finance/payables");
      revalidatePath("/finance/reports/balance-sheet");
      revalidatePath("/purchasing/orders");
      revalidatePath("/warehouse/inventory");
      return { message: "Invoice deleted successfully" };
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      logger.error("Failed to delete invoice", {
        error,
        invoiceId: id,
        invoiceType: type,
        module: "InvoicesActions",
      });
      throw new BusinessRuleError(
        "Failed to delete invoice. Ensure no dependencies exist.",
      );
    }
  });
});
