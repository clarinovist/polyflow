import { z } from 'zod';

const money = z.string().regex(/^\d+\.\d{2}$/);
const quantity = z.number().finite().nonnegative();
export const invoiceSnapshotSchema = z
    .object({
        version: z.literal(1),
        basis: z.enum(['DELIVERED', 'ORDERED']),
        orderNumber: z.string(),
        customer: z
            .object({
                name: z.string(),
                billingAddress: z.string().nullable(),
                taxId: z.string().nullable(),
                phone: z.string().nullable(),
                email: z.string().nullable(),
            })
            .nullable(),
        items: z.array(
            z.object({
                sourceItemId: z.string(),
                productVariantId: z.string(),
                name: z.string(),
                skuCode: z.string(),
                unit: z.string(),
                quantity,
                unitPrice: money,
                discountPercent: z.number().finite().min(0).max(100),
                taxPercent: z.number().finite().min(0).max(100),
                ppnMode: z.enum(['INCLUDE', 'EXCLUDE']),
                discountAmount: money,
                netAmount: money,
                taxAmount: money,
                totalAmount: money,
                enteredUnit: z.string(),
                conversionFactor: z.number().finite().positive(),
                enteredQuantity: quantity,
                enteredUnitPrice: money,
                revenueAccountId: z.string().nullable(),
                product: z.object({
                    id: z.string(),
                    name: z.string(),
                    revenueAccountId: z.string().nullable(),
                }),
            }),
        ),
        shippingAmount: money,
        discountAmount: money,
        taxAmount: money,
        commercialTotal: money,
    })
    .superRefine((value, ctx) => {
        const cents = (v: string) => Math.round(Number(v) * 100);
        const sum = (field: 'taxAmount' | 'discountAmount' | 'totalAmount') =>
            value.items.reduce((s, i) => s + cents(i[field]), 0);
        if (
            new Set(value.items.map((i) => i.sourceItemId)).size !==
                value.items.length ||
            value.items.some(
                (i) =>
                    cents(i.netAmount) + cents(i.taxAmount) !==
                    cents(i.totalAmount),
            ) ||
            sum('taxAmount') !== cents(value.taxAmount) ||
            sum('discountAmount') !== cents(value.discountAmount) ||
            sum('totalAmount') + cents(value.shippingAmount) !==
                cents(value.commercialTotal)
        ) {
            ctx.addIssue({
                code: 'custom',
                message: 'Rincian snapshot invoice tidak seimbang.',
            });
        }
    });
export type InvoiceSnapshot = z.infer<typeof invoiceSnapshotSchema>;

/** null is legacy, malformed non-null data is a hard error, not a legacy fallback. */
export function readInvoiceSnapshot(value: unknown): InvoiceSnapshot | null {
    return value == null ? null : invoiceSnapshotSchema.parse(value);
}

export const LEGACY_INVOICE_NOTICE =
    'Invoice historis tanpa snapshot rincian. Total tetap sesuai dokumen tersimpan; rincian barang memerlukan pemeriksaan Finance.';

/** The only shape supplied to invoice detail/print; never use today's SO rows as historical evidence. */
export function invoiceSnapshotOrder(value: unknown) {
    const snapshot = readInvoiceSnapshot(value);
    if (!snapshot) return null;
    return {
        orderNumber: snapshot.orderNumber,
        customer: snapshot.customer,
        taxAmount: Number(snapshot.taxAmount),
        discountAmount: Number(snapshot.discountAmount),
        shippingCost: Number(snapshot.shippingAmount),
        items: snapshot.items.map((item) => ({
            id: item.sourceItemId,
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice),
            subtotal: Number(item.totalAmount),
            taxAmount: Number(item.taxAmount),
            discountPercent: item.discountPercent,
            discountAmount: Number(item.discountAmount),
            enteredQuantity: item.enteredQuantity,
            enteredUnit: item.enteredUnit,
            enteredUnitPrice: Number(item.enteredUnitPrice),
            productVariant: {
                name: item.name,
                primaryUnit: item.unit,
                salesUnit: item.enteredUnit,
                product: item.product,
            },
        })),
    };
}
