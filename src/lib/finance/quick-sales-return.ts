import { z } from 'zod';

const id = z.string().trim().min(1).max(100);
export const quickReturnSelectionSchema = z
    .object({
        salesOrderId: id,
        items: z
            .array(
                z.object({
                    productVariantId: id,
                    quantity: z
                        .string()
                        .regex(
                            /^\d{1,11}(\.\d{1,4})?$/,
                            'Jumlah maksimal 4 desimal.',
                        )
                        .refine(
                            (value) => Number(value) > 0,
                            'Jumlah harus lebih dari nol.',
                        ),
                }),
            )
            .min(1, 'Isi jumlah retur untuk minimal satu produk.')
            .max(100),
    })
    .superRefine((data, context) => {
        if (
            new Set(data.items.map((item) => item.productVariantId)).size !==
            data.items.length
        )
            context.addIssue({
                code: 'custom',
                path: ['items'],
                message: 'Produk retur tidak boleh berulang.',
            });
    });

export const quickReturnPostSchema = z.object({
    selection: quickReturnSelectionSchema,
    requestId: z.string().uuid(),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    confirmed: z.literal(true),
});
export type QuickReturnSelection = z.infer<typeof quickReturnSelectionSchema>;
export type QuickReturnPreview = {
    fingerprint: string;
    invoiceNumber: string;
    orderNumber: string;
    totalAmount: string;
    taxAmount: string;
    remaining: string;
    remainingAfter: string;
    source: 'SNAPSHOT' | 'SO_REVIEW';
    locationName: string;
    items: {
        productVariantId: string;
        name: string;
        quantity: string;
        unit: string;
    }[];
};
