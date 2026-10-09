import { Prisma, PurchaseInvoiceStatus } from '@prisma/client';
import { getWibDayBounds, toBusinessDateString } from '@/lib/utils/timezone';

export const PURCHASE_INVOICE_OUTSTANDING_STATUSES = [
    PurchaseInvoiceStatus.UNPAID,
    PurchaseInvoiceStatus.PARTIAL,
    PurchaseInvoiceStatus.OVERDUE,
] as const;

export function buildOverduePurchaseInvoiceWhere(
    client: { purchaseInvoice: { fields: { paidAmount: unknown } } },
    now: Date = new Date(),
): Prisma.PurchaseInvoiceWhereInput {
    const cutoff = getWibDayBounds(toBusinessDateString(now)).startOfDay;
    return {
        status: { in: [...PURCHASE_INVOICE_OUTSTANDING_STATUSES] },
        dueDate: { lt: cutoff },
        totalAmount: {
            gt: client.purchaseInvoice.fields.paidAmount as Prisma.DecimalFieldRefInput<'PurchaseInvoice'>,
        },
    };
}
