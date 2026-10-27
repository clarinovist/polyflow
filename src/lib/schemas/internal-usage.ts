import { z } from 'zod';
import { parseBusinessDate } from '@/lib/utils/timezone';

export const INTERNAL_USAGE_RESOURCE = '/warehouse/internal-usage';
export const internalUsageSchema = z.object({
    requestId: z.string().uuid(),
    productVariantId: z.string().min(1).max(100),
    locationId: z.string().min(1).max(100),
    quantity: z
        .number()
        .finite()
        .positive('Jumlah harus lebih dari nol.')
        .max(99999999999)
        .refine(
            (value) =>
                Math.abs(value * 10000 - Math.round(value * 10000)) < 0.001,
            'Maksimal 4 angka desimal.',
        ),
    unit: z.enum(['KG', 'ROLL', 'BAL', 'PCS', 'ZAK', 'KARTON']),
    date: z.string().refine((value) => {
        try {
            parseBusinessDate(value);
            return true;
        } catch {
            return false;
        }
    }, 'Tanggal pemakaian tidak valid.'),
    recipient: z.string().trim().min(1, 'Isi penerima barang.').max(100),
    department: z.string().trim().min(1, 'Isi bagian penerima.').max(100),
    purpose: z.string().trim().min(1, 'Isi keperluan pemakaian.').max(500),
});
export type InternalUsageInput = z.infer<typeof internalUsageSchema>;

export const internalUsageFiltersSchema = z.object({
    query: z.string().trim().max(100).default(''),
    department: z.string().trim().max(100).default(''),
    page: z.coerce.number().int().min(1).max(100000).default(1),
});

export const internalUsageReadinessSchema = internalUsageSchema.pick({
    productVariantId: true,
    locationId: true,
    quantity: true,
});
export type InternalUsageReadinessInput = z.infer<
    typeof internalUsageReadinessSchema
>;
