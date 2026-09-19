import { z } from 'zod';

// Strings preserve cents across the browser/action boundary; no exponent or locale coercion.
const money = z
    .string()
    .regex(
        /^(0|[1-9]\d{0,12})(\.\d{1,2})?$/,
        'Gunakan nominal positif, maksimal dua desimal, tanpa pemisah ribuan.',
    );
export const manualReturnCreditSchema = z
    .object({
        returnId: z.string().trim().min(1).max(100),
        invoiceId: z.string().trim().min(1).max(100),
        postingDate: z.coerce.date(),
        totalAmount: money.refine(
            (value) => Number(value) > 0,
            'Nilai kredit harus lebih dari nol.',
        ),
        taxAmount: money,
        expectedRemaining: money,
        reason: z
            .string()
            .trim()
            .min(5, 'Alasan minimal 5 karakter.')
            .max(1000),
        evidence: z
            .string()
            .trim()
            .min(5, 'Referensi bukti wajib diisi.')
            .max(1000),
        confirmed: z.literal(true, {
            error: 'Konfirmasi pemeriksaan Finance wajib.',
        }),
    })
    .refine((value) => Number(value.taxAmount) <= Number(value.totalAmount), {
        path: ['taxAmount'],
        message: 'Pajak tidak boleh melebihi total kredit.',
    });
