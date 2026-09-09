import { z } from 'zod';

const moneySchema = z.union([z.number().finite(), z.string().trim().min(1)]);

export const saveBarterPartnerSchema = z.object({
    customerId: z.string().uuid(),
    supplierId: z.string().uuid(),
    isActive: z.boolean(),
});

export const createBarterSettlementSchema = z
    .object({
        invoiceId: z.string().uuid(),
        purchaseInvoiceId: z.string().uuid(),
        barterAmount: moneySchema,
        barterDate: z.coerce.date(),
        includeCashPayment: z.boolean().default(false),
        cashAmount: moneySchema.optional(),
        cashMethod: z.string().trim().optional(),
        cashPaymentDate: z.coerce.date().optional(),
        cashReferenceNumber: z.string().trim().max(120).optional(),
        notes: z.string().trim().min(1).max(2000),
        idempotencyKey: z.string().trim().min(8).max(200),
    })
    .superRefine((data, ctx) => {
        if (!data.includeCashPayment) return;
        if (data.cashAmount === undefined || data.cashAmount === '') {
            ctx.addIssue({
                code: 'custom',
                path: ['cashAmount'],
                message: 'Jumlah pembayaran tambahan wajib diisi.',
            });
        }
        if (!data.cashMethod) {
            ctx.addIssue({
                code: 'custom',
                path: ['cashMethod'],
                message: 'Metode pembayaran tambahan wajib diisi.',
            });
        }
        if (!data.cashPaymentDate) {
            ctx.addIssue({
                code: 'custom',
                path: ['cashPaymentDate'],
                message: 'Tanggal pembayaran tambahan wajib diisi.',
            });
        }
    });

export const voidBarterSettlementSchema = z.object({
    settlementId: z.string().uuid(),
    reason: z.string().trim().min(5).max(2000),
});

export type SaveBarterPartnerInput = z.infer<typeof saveBarterPartnerSchema>;
export type CreateBarterSettlementInput = z.input<
    typeof createBarterSettlementSchema
>;
export type ParsedCreateBarterSettlementInput = z.output<
    typeof createBarterSettlementSchema
>;
export type VoidBarterSettlementInput = z.infer<
    typeof voidBarterSettlementSchema
>;
