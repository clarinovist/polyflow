/**
 * Decimal -> number conversion for the invoice print pages.
 *
 * getInvoiceById / getSalesInvoiceForPrint return Prisma Decimals (serialized
 * as strings); the print component computes with plain numbers. Shared by the
 * finance and sales print routes so both render identical figures.
 */

interface PrintableInvoiceInput {
    totalAmount: unknown;
    paidAmount: unknown;
    creditedAmount?: unknown;
    priceAdjustmentAmount?: unknown;
    salesOrder?:
        | ({
              taxAmount?: unknown;
              items?: ReadonlyArray<Record<string, unknown>> | null;
          } & Record<string, unknown>)
        | null;
}

function optionalNumber(value: unknown): number | undefined {
    return value != null ? Number(value) : undefined;
}

function serializeItem(item: Record<string, unknown>) {
    return {
        ...item,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        enteredQuantity: optionalNumber(item.enteredQuantity),
        enteredUnitPrice: optionalNumber(item.enteredUnitPrice),
    };
}

function serializeSalesOrder(
    salesOrder: NonNullable<PrintableInvoiceInput['salesOrder']>,
) {
    return {
        ...salesOrder,
        taxAmount:
            salesOrder.taxAmount != null ? Number(salesOrder.taxAmount) : 0,
        items: salesOrder.items?.map(serializeItem),
    };
}

export function serializeInvoiceForPrint(
    raw: PrintableInvoiceInput & Record<string, unknown>,
): Record<string, unknown> {
    return {
        ...raw,
        totalAmount: Number(raw.totalAmount),
        paidAmount: Number(raw.paidAmount),
        creditedAmount: Number(raw.creditedAmount ?? 0),
        priceAdjustmentAmount: Number(raw.priceAdjustmentAmount ?? 0),
        salesOrder: raw.salesOrder
            ? serializeSalesOrder(raw.salesOrder)
            : undefined,
    };
}
