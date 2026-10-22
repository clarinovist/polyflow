import { z } from 'zod';

const quantity = z.number().finite().positive().max(999999999).multipleOf(0.0001);

export const packagingConsumptionSchema = z.object({
    productVariantId: z.string().min(1),
    sourceLocationId: z.string().min(1),
    ownerCustomerId: z.string().min(1).nullable(),
    // Missing unit is the original PCS contract, never an implicit KG conversion.
    unit: z.enum(['KG', 'PCS']).optional(),
    quantity,
}).superRefine((row, ctx) => {
    if ((row.unit ?? 'PCS') === 'PCS' && !Number.isInteger(row.quantity)) {
        ctx.addIssue({ code: 'custom', message: 'Jumlah kemasan PCS/lembar harus bilangan bulat.', path: ['quantity'] });
    }
});

export const packagedOutputSchema = z.object({
    clientRequestId: z.string().uuid(),
    groups: z.array(z.object({
        productVariantId: z.string().min(1),
        quantity,
        packaging: z.array(packagingConsumptionSchema).min(1).max(10),
    })).max(2),
}).superRefine((value, ctx) => {
    if (new Set(value.groups.map((group) => group.productVariantId)).size !== value.groups.length) {
        ctx.addIssue({ code: 'custom', message: 'Gabungkan hasil dengan merek yang sama.', path: ['groups'] });
    }
    value.groups.forEach((group, index) => {
        const keys = group.packaging.map((row) => `${row.productVariantId}:${row.sourceLocationId}`);
        if (new Set(keys).size !== keys.length) {
            ctx.addIssue({ code: 'custom', message: 'Gabungkan pemakaian kemasan dari sumber yang sama.', path: ['groups', index, 'packaging'] });
        }
    });
});

export const packagingOptionSchema = z.object({
    baseVariantId: z.string().min(1),
    outputVariantId: z.string().min(1),
    labelVariantId: z.string().min(1).nullable(),
});

export type PackagedOutputValues = z.infer<typeof packagedOutputSchema>;
export type PackagingConsumptionValues = z.infer<typeof packagingConsumptionSchema>;
