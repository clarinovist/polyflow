import { prisma } from '@/lib/core/prisma';
import { ReferenceType } from '@prisma/client';

/**
 * A journal entry's pointer to the business document that produced it.
 * Both fields are nullable in the schema — `MANUAL_ENTRY` and legacy rows
 * carry no document at all.
 */
export interface JournalSourceRef {
    referenceType: ReferenceType | null;
    referenceId: string | null;
}

/**
 * Key used by the returned map. `referenceId` alone is not enough: the same
 * uuid space is shared by Payment / Invoice / PurchaseInvoice tables.
 */
export function sourceDocKey(ref: JournalSourceRef): string | null {
    if (!ref.referenceType || !ref.referenceId) return null;
    return `${ref.referenceType}:${ref.referenceId}`;
}

function collectIds(
    refs: readonly JournalSourceRef[],
    types: readonly ReferenceType[],
): string[] {
    const ids = new Set<string>();
    for (const ref of refs) {
        if (!ref.referenceId || !ref.referenceType) continue;
        if (types.includes(ref.referenceType)) ids.add(ref.referenceId);
    }
    return [...ids];
}

/**
 * Resolve the customer/supplier-facing document number for a batch of journal
 * references, so ledger reports can show "NO INV / NO PO" next to the memo.
 *
 * Batched on purpose: one query per source table regardless of how many
 * journal entries are passed in.
 *
 * Convention (confirmed with finance 2026-08-10):
 * - sales side  → invoice number (`10/INV/VIII/2026`)
 * - purchase side → PO number (`PO-2026-0054`), falling back to the bill
 *   number when a purchase invoice has no order attached.
 *
 * Returns a map keyed by `sourceDocKey()`. References without a resolvable
 * document are simply absent — callers render an empty cell.
 */
export async function resolveSourceDocNumbers(
    refs: readonly JournalSourceRef[],
): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    const paymentIds = collectIds(refs, [
        ReferenceType.SALES_PAYMENT,
        ReferenceType.PURCHASE_PAYMENT,
    ]);
    const purchaseInvoiceIds = collectIds(refs, [
        ReferenceType.PURCHASE_INVOICE,
    ]);
    const salesInvoiceIds = collectIds(refs, [ReferenceType.SALES_INVOICE]);

    const [payments, purchaseInvoices, salesInvoices] = await Promise.all([
        paymentIds.length
            ? prisma.payment.findMany({
                  where: { id: { in: paymentIds } },
                  select: {
                      id: true,
                      invoice: { select: { invoiceNumber: true } },
                      purchaseInvoice: {
                          select: {
                              invoiceNumber: true,
                              purchaseOrder: { select: { orderNumber: true } },
                          },
                      },
                  },
              })
            : Promise.resolve([]),
        purchaseInvoiceIds.length
            ? prisma.purchaseInvoice.findMany({
                  where: { id: { in: purchaseInvoiceIds } },
                  select: {
                      id: true,
                      invoiceNumber: true,
                      purchaseOrder: { select: { orderNumber: true } },
                  },
              })
            : Promise.resolve([]),
        salesInvoiceIds.length
            ? prisma.invoice.findMany({
                  where: { id: { in: salesInvoiceIds } },
                  select: { id: true, invoiceNumber: true },
              })
            : Promise.resolve([]),
    ]);

    for (const payment of payments) {
        const salesNumber = payment.invoice?.invoiceNumber;
        if (salesNumber) {
            result.set(
                `${ReferenceType.SALES_PAYMENT}:${payment.id}`,
                salesNumber,
            );
        }

        const purchaseNumber =
            payment.purchaseInvoice?.purchaseOrder?.orderNumber ??
            payment.purchaseInvoice?.invoiceNumber;
        if (purchaseNumber) {
            result.set(
                `${ReferenceType.PURCHASE_PAYMENT}:${payment.id}`,
                purchaseNumber,
            );
        }
    }

    for (const invoice of purchaseInvoices) {
        const number =
            invoice.purchaseOrder?.orderNumber ?? invoice.invoiceNumber;
        if (number) {
            result.set(
                `${ReferenceType.PURCHASE_INVOICE}:${invoice.id}`,
                number,
            );
        }
    }

    for (const invoice of salesInvoices) {
        if (invoice.invoiceNumber) {
            result.set(
                `${ReferenceType.SALES_INVOICE}:${invoice.id}`,
                invoice.invoiceNumber,
            );
        }
    }

    return result;
}
