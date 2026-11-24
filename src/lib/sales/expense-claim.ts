import { z } from 'zod';
import { BusinessRuleError, ValidationError } from '@/lib/errors/errors';
import {
    businessDateToEntryDate,
    toBusinessDateString,
} from '@/lib/utils/timezone';

export const EXPENSE_CLAIM_CATEGORIES = [
    'BBM',
    'PARKIR',
    'TOL',
    'MAKAN',
    'TRANSPORT_LAIN',
    'LAINNYA',
] as const;
export const EXPENSE_CLAIM_STATUSES = [
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'PAID',
    'CANCELLED',
] as const;

export const CLAIM_DESCRIPTION_MAX_LENGTH = 500;
export const REJECTION_REASON_MIN_LENGTH = 3;
export const REJECTION_REASON_MAX_LENGTH = 300;
/** Oldest allowed expense date, in WIB calendar days before today. */
export const CLAIM_MAX_BACKDATE_DAYS = 90;
/** Matches the Decimal(15,2) column. */
export const CLAIM_MAX_AMOUNT = 9_999_999_999_999.99;
export const CLAIM_LIST_DEFAULT_TAKE = 50;
export const CLAIM_LIST_MAX_TAKE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;
const CENTS = 100;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ID_LENGTH = 100;

export interface ExpenseClaimActor {
    id: string;
    /** Computed from the session roles (a user may hold several), not from input. */
    isAdmin: boolean;
}

const idField = z
    .string('ID wajib diisi')
    .trim()
    .min(1, 'ID wajib diisi')
    .max(MAX_ID_LENGTH, 'ID tidak valid');
const dateOnly = z
    .string('Tanggal wajib diisi')
    .regex(DATE_ONLY, 'Format tanggal harus YYYY-MM-DD');

export const submitClaimSchema = z.object({
    expenseDate: dateOnly,
    category: z.enum(EXPENSE_CLAIM_CATEGORIES, 'Kategori tidak valid'),
    amount: z
        .number('Nominal harus berupa angka')
        .positive('Nominal harus lebih dari nol')
        .max(CLAIM_MAX_AMOUNT, 'Nominal terlalu besar')
        .refine(
            (value) =>
                Math.abs(value * CENTS - Math.round(value * CENTS)) < 1e-6,
            'Gunakan maksimal dua angka desimal',
        ),
    description: z
        .string('Keterangan wajib diisi')
        .trim()
        .min(1, 'Keterangan wajib diisi')
        .max(
            CLAIM_DESCRIPTION_MAX_LENGTH,
            `Keterangan maksimal ${CLAIM_DESCRIPTION_MAX_LENGTH} karakter`,
        ),
    receiptUrl: z
        .string('Foto nota wajib diunggah')
        .trim()
        .min(1, 'Foto nota wajib diunggah')
        .max(500, 'URL foto nota tidak valid'),
    salesVisitId: idField.optional(),
    clientClaimId: idField.optional(),
});
export type SubmitClaimInput = z.infer<typeof submitClaimSchema>;

export const claimIdSchema = idField;

export const rejectClaimSchema = z.object({
    claimId: idField,
    reason: z
        .string('Alasan penolakan wajib diisi')
        .trim()
        .min(
            REJECTION_REASON_MIN_LENGTH,
            `Alasan penolakan minimal ${REJECTION_REASON_MIN_LENGTH} karakter`,
        )
        .max(
            REJECTION_REASON_MAX_LENGTH,
            `Alasan penolakan maksimal ${REJECTION_REASON_MAX_LENGTH} karakter`,
        ),
});

export const payClaimAccountsSchema = z.object({
    expenseAccountId: idField,
    paymentAccountId: idField,
    paymentDate: dateOnly.optional(),
});
export const payClaimSchema = payClaimAccountsSchema.extend({
    claimId: idField,
});
export type PayClaimInput = z.infer<typeof payClaimAccountsSchema>;

export const listClaimsSchema = z
    .object({
        status: z.enum(EXPENSE_CLAIM_STATUSES, 'Status tidak valid').optional(),
        take: z.number().int().positive().optional(),
    })
    .optional();

/** Parses at a trust boundary; the first zod issue becomes a ValidationError. */
export function parseClaimInput<T>(schema: z.ZodType<T>, raw: unknown): T {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0].message);
    }
    return parsed.data;
}

export function clampTake(take: number | undefined): number {
    if (take === undefined || !Number.isFinite(take))
        return CLAIM_LIST_DEFAULT_TAKE;
    return Math.min(Math.max(Math.trunc(take), 1), CLAIM_LIST_MAX_TAKE);
}

function toExpenseInstant(dateOnlyValue: string): Date {
    try {
        return businessDateToEntryDate(dateOnlyValue);
    } catch {
        throw new ValidationError('Tanggal pengeluaran tidak valid');
    }
}

/**
 * The expense date must be a real calendar day, not later than today (WIB) and
 * not older than CLAIM_MAX_BACKDATE_DAYS. Returns the WIB-midnight instant.
 */
export function resolveExpenseDate(dateOnlyValue: string, now: Date): Date {
    const instant = toExpenseInstant(dateOnlyValue);
    const today = businessDateToEntryDate(toBusinessDateString(now));
    if (instant.getTime() > today.getTime()) {
        throw new BusinessRuleError(
            'Tanggal pengeluaran tidak boleh di masa depan',
            { expenseDate: dateOnlyValue },
            'EXPENSE_DATE_IN_FUTURE',
        );
    }
    const oldest = today.getTime() - CLAIM_MAX_BACKDATE_DAYS * DAY_MS;
    if (instant.getTime() < oldest) {
        throw new BusinessRuleError(
            `Nota lebih lama dari ${CLAIM_MAX_BACKDATE_DAYS} hari tidak dapat diklaim`,
            { expenseDate: dateOnlyValue },
            'EXPENSE_DATE_TOO_OLD',
        );
    }
    return instant;
}

/** Payment date: optional `YYYY-MM-DD`, default today, never in the future (WIB). */
export function resolvePaymentDate(
    dateOnlyValue: string | undefined,
    now: Date,
): Date {
    const today = businessDateToEntryDate(toBusinessDateString(now));
    if (dateOnlyValue === undefined) return today;
    let instant: Date;
    try {
        instant = businessDateToEntryDate(dateOnlyValue);
    } catch {
        throw new ValidationError('Tanggal pembayaran tidak valid');
    }
    if (instant.getTime() > today.getTime()) {
        throw new BusinessRuleError(
            'Tanggal pembayaran tidak boleh di masa depan',
            { paymentDate: dateOnlyValue },
            'PAYMENT_DATE_IN_FUTURE',
        );
    }
    return instant;
}
