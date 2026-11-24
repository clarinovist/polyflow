import {
    CLAIM_DESCRIPTION_MAX_LENGTH,
    CLAIM_MAX_AMOUNT,
    CLAIM_MAX_BACKDATE_DAYS,
    EXPENSE_CLAIM_CATEGORIES,
    type SubmitClaimInput,
} from '@/lib/sales/expense-claim';
import {
    businessDateToEntryDate,
    toBusinessDateString,
} from '@/lib/utils/timezone';

/** UI-side helpers for the field-sales claim form and history. Pure, no I/O. */

export type ExpenseClaimCategoryValue =
    (typeof EXPENSE_CLAIM_CATEGORIES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const AMOUNT_MAX_DIGITS = String(Math.trunc(CLAIM_MAX_AMOUNT)).length;
const THOUSANDS_SEPARATOR = '.';
const THOUSANDS_PATTERN = /\B(?=(\d{3})+(?!\d))/g;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const CATEGORY_LABELS: Readonly<
    Record<ExpenseClaimCategoryValue, string>
> = {
    BBM: 'BBM',
    PARKIR: 'Parkir',
    TOL: 'Tol',
    MAKAN: 'Makan',
    TRANSPORT_LAIN: 'Transport lain',
    LAINNYA: 'Lainnya',
};

export const CATEGORY_OPTIONS = EXPENSE_CLAIM_CATEGORIES.map((value) => ({
    value,
    label: CATEGORY_LABELS[value],
}));

export interface ClaimStatusMeta {
    label: string;
    className: string;
}

const STATUS_META: Readonly<Record<string, ClaimStatusMeta>> = {
    SUBMITTED: {
        label: 'Menunggu',
        className: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    APPROVED: {
        label: 'Disetujui',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    REJECTED: {
        label: 'Ditolak',
        className: 'bg-red-100 text-red-800 border-red-200',
    },
    PAID: {
        label: 'Dibayar',
        className: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    CANCELLED: {
        label: 'Dibatalkan',
        className: 'bg-gray-100 text-gray-600 border-gray-200',
    },
};

const UNKNOWN_STATUS_CLASS = 'bg-gray-100 text-gray-600 border-gray-200';

export function categoryLabel(category: string): string {
    return CATEGORY_LABELS[category as ExpenseClaimCategoryValue] ?? category;
}

export function statusMeta(status: string): ClaimStatusMeta {
    return (
        STATUS_META[status] ?? {
            label: status,
            className: UNKNOWN_STATUS_CLASS,
        }
    );
}

/** Only SUBMITTED claims can still be cancelled by their owner. */
export function canCancelClaim(status: string): boolean {
    return status === 'SUBMITTED';
}

/** Keeps digits only (whole rupiah), drops leading zeros, caps the length. */
export function sanitizeAmountInput(raw: string): string {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    return digits.slice(0, AMOUNT_MAX_DIGITS);
}

/** "1250000" -> "1.250.000" (display only). */
export function formatAmountInput(digits: string): string {
    return digits.replace(THOUSANDS_PATTERN, THOUSANDS_SEPARATOR);
}

export function parseAmountDigits(digits: string): number | null {
    if (!digits) return null;
    const value = Number(digits);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Today in WIB as YYYY-MM-DD (the form's default and upper bound). */
export function todayWib(now: Date): string {
    return toBusinessDateString(now);
}

/** Selectable expense-date range in WIB calendar days. */
export function claimDateBounds(now: Date): { min: string; max: string } {
    const max = toBusinessDateString(now);
    const oldestMs =
        businessDateToEntryDate(max).getTime() -
        CLAIM_MAX_BACKDATE_DAYS * DAY_MS;
    return { min: toBusinessDateString(new Date(oldestMs)), max };
}

export interface ClaimDraft {
    receiptUrl: string | null;
    category: ExpenseClaimCategoryValue | '';
    amountDigits: string;
    expenseDate: string;
    description: string;
}

/** First problem with the draft as a user-facing message, or null when valid. */
export function validateClaimDraft(
    draft: ClaimDraft,
    now: Date,
): string | null {
    if (!draft.receiptUrl) return 'Foto nota wajib diunggah';
    if (!draft.category) return 'Pilih kategori pengeluaran';
    if (parseAmountDigits(draft.amountDigits) === null) {
        return 'Nominal harus lebih dari nol';
    }
    const dateError = validateExpenseDate(draft.expenseDate, now);
    if (dateError) return dateError;
    const description = draft.description.trim();
    if (!description) return 'Keterangan wajib diisi';
    if (description.length > CLAIM_DESCRIPTION_MAX_LENGTH) {
        return `Keterangan maksimal ${CLAIM_DESCRIPTION_MAX_LENGTH} karakter`;
    }
    return null;
}

function validateExpenseDate(value: string, now: Date): string | null {
    if (!DATE_ONLY.test(value)) return 'Tanggal pengeluaran wajib diisi';
    const { min, max } = claimDateBounds(now);
    if (value > max) return 'Tanggal pengeluaran tidak boleh di masa depan';
    if (value < min) {
        return `Nota lebih lama dari ${CLAIM_MAX_BACKDATE_DAYS} hari tidak dapat diklaim`;
    }
    return null;
}

export interface SubmitContext {
    clientClaimId: string;
    salesVisitId?: string;
}

/** Builds the exact payload `submitExpenseClaim` expects from a validated draft. */
export function buildSubmitInput(
    draft: ClaimDraft,
    context: SubmitContext,
): SubmitClaimInput {
    const amount = parseAmountDigits(draft.amountDigits);
    if (!draft.receiptUrl || !draft.category || amount === null) {
        throw new Error('Draf klaim belum lengkap');
    }
    return {
        expenseDate: draft.expenseDate,
        category: draft.category,
        amount,
        description: draft.description.trim(),
        receiptUrl: draft.receiptUrl,
        clientClaimId: context.clientClaimId,
        ...(context.salesVisitId ? { salesVisitId: context.salesVisitId } : {}),
    };
}

/** Item shape the history list reads (a structural subset of ClaimView, serialized). */
export interface ClaimListItem {
    id: string;
    claimNumber: string;
    expenseDate: string;
    category: string;
    amount: number;
    description: string;
    receiptUrl: string;
    status: string;
    rejectionReason: string | null;
    salesVisit: { customer: { name: string } | null } | null;
}
