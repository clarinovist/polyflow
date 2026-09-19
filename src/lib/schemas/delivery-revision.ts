import { z } from 'zod';

const quantity = z
    .number()
    .finite()
    .min(0)
    .max(999999999)
    .refine(
        (value) => Math.abs(value * 10000 - Math.round(value * 10000)) < 0.001,
        'Qty maksimal 4 angka desimal',
    );

export const deliveryRevisionSchema = z
    .object({
        deliveryOrderId: z.string().min(1),
        orderVersion: z.string().datetime(),
        deliveryVersion: z.string().datetime(),
        reason: z.string().trim().min(5, 'Alasan minimal 5 karakter').max(500),
        remainder: z.enum(['KEEP', 'CLOSE']).default('KEEP'),
        // All existing SO lines must be present, including lines not on this DO.
        items: z
            .array(
                z.object({
                    salesOrderItemId: z.string().min(1),
                    quantity,
                }),
            )
            .min(1)
            .max(200),
        additions: z
            .array(
                z.object({
                    productVariantId: z.string().min(1),
                    quantity: quantity.refine(
                        (value) => value > 0,
                        'Qty harus lebih dari 0',
                    ),
                    unitPrice: z
                        .number()
                        .finite()
                        .positive('Harga wajib lebih dari 0')
                        .max(999999999)
                        .refine(
                            (value) =>
                                Math.abs(
                                    value * 100 - Math.round(value * 100),
                                ) < 0.001,
                            'Harga maksimal 2 angka desimal',
                        ),
                    taxPercent: z.number().finite().min(0).max(100),
                    ppnMode: z.enum(['INCLUDE', 'EXCLUDE']),
                }),
            )
            .max(100)
            .default([]),
    })
    .superRefine((data, ctx) => {
        if (
            new Set(data.items.map((item) => item.salesOrderItemId)).size !==
                data.items.length ||
            new Set(data.additions.map((item) => item.productVariantId))
                .size !== data.additions.length
        ) {
            ctx.addIssue({
                code: 'custom',
                message: 'Baris barang tidak boleh duplikat',
            });
        }
        if (
            ![...data.items, ...data.additions].some(
                (item) => item.quantity > 0,
            )
        ) {
            ctx.addIssue({
                code: 'custom',
                message: 'Minimal satu barang harus dimuat',
            });
        }
    });

export type DeliveryRevisionInput = z.infer<typeof deliveryRevisionSchema>;
