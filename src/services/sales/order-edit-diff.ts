import type { SalesOrderItem } from '@prisma/client';

const numericFields = ['quantity', 'unitPrice', 'enteredQuantity', 'enteredUnitPrice', 'conversionFactorSnapshot', 'discountPercent', 'taxPercent', 'dppOtherAmount'] as const;
type Input = { productVariantId: string; quantity: number; unitPrice: number; enteredUnit?: string | null; ppnMode?: string; isFreeItem?: boolean } & Partial<Record<typeof numericFields[number], number | null>>;

/** Compare commercial intent, not recalculated tax/rounding or mutation metadata. */
export function unchangedSalesLine(old: SalesOrderItem, input: Input) {
    if (old.productVariantId !== input.productVariantId || (old.enteredUnit ?? null) !== (input.enteredUnit ?? null) || (old.ppnMode ?? 'EXCLUDE') !== (input.ppnMode ?? 'EXCLUDE') || Boolean(old.isFreeItem) !== Boolean(input.isFreeItem)) return false;
    return numericFields.every(key => {
        const zeroDefault = key === 'discountPercent' || key === 'taxPercent';
        const a = old[key] == null ? (zeroDefault ? 0 : null) : Number(old[key]);
        const b = input[key] == null ? (zeroDefault ? 0 : null) : Number(input[key]);
        return a === b;
    });
}

/** Audit JSON has decimal strings and excludes customer/contact/notes payloads. */
export function salesEditAuditSnapshot(order: { items?: unknown[]; [key: string]: unknown }) {
    const fields = ['id', 'status', 'priceStatus', 'customerId', 'salesRepId', 'sourceLocationId', 'orderDate', 'expectedDate', 'validUntil', 'nextFollowUpDate', 'totalAmount', 'discountAmount', 'taxAmount', 'shippingCost', 'updatedAt'];
    return JSON.parse(JSON.stringify({
        ...Object.fromEntries(fields.map(key => [key, order[key]])),
        // Text may contain personal data: audit whether it changed, not its contents.
        textFieldsPresent: Object.fromEntries(['notes', 'subject', 'paymentTerms', 'shippingTerms', 'termsConditions'].map(key => [key, Boolean(order[key])])),
        items: order.items,
    })) as Record<string, unknown>;
}
