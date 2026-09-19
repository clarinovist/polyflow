import { addDays, startOfDay } from 'date-fns';

/** Opsi tempo pembayaran. value = jumlah hari, 0 = Cash. */
export const PAYMENT_TERM_OPTIONS = [
    { value: 0, label: 'Cash / 0 hari' },
    { value: 7, label: '7 hari' },
    { value: 14, label: '14 hari' },
    { value: 30, label: '30 hari' },
    { value: 45, label: '45 hari' },
    { value: 60, label: '60 hari' },
] as const;

type AmountLike =
    | number
    | string
    | null
    | undefined
    | { toNumber: () => number };

const OVERDUE_ACTION_STATUSES = new Set(['OVERDUE', 'UNPAID', 'PARTIAL']);

function toFiniteAmount(value: AmountLike): number {
    if (value && typeof value === 'object' && 'toNumber' in value) {
        const amount = value.toNumber();
        return Number.isFinite(amount) ? amount : 0;
    }

    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? amount : 0;
}

export function getInvoiceRemainingAmount(
    totalAmount: AmountLike,
    paidAmount: AmountLike,
    creditedAmount: AmountLike = 0,
    priceAdjustmentAmount: AmountLike = 0,
): number {
    return Math.max(
        toFiniteAmount(totalAmount) + toFiniteAmount(priceAdjustmentAmount) - toFiniteAmount(paidAmount) - toFiniteAmount(creditedAmount),
        0,
    );
}

export type ActionableInvoiceOverdueInput = {
    dueDate: Date | string | null | undefined;
    status?: string | null;
    totalAmount: AmountLike;
    paidAmount: AmountLike;
    creditedAmount?: AmountLike;
    priceAdjustmentAmount?: AmountLike;
};

/**
 * Collection/work-board overdue definition.
 *
 * Unlike `isInvoiceOverdue`, this is not a display/status helper. It only
 * returns true for invoices that still need action: unpaid/partial/overdue,
 * past the due-date day, and with remaining balance > 0.
 */
export function isActionableInvoiceOverdue(
    invoice: ActionableInvoiceOverdueInput,
    referenceDate = new Date(),
): boolean {
    const status = invoice.status?.toUpperCase();
    if (!status || !OVERDUE_ACTION_STATUSES.has(status)) return false;
    if (
        getInvoiceRemainingAmount(invoice.totalAmount, invoice.paidAmount, invoice.creditedAmount, invoice.priceAdjustmentAmount) <= 0
    ) {
        return false;
    }
    if (!invoice.dueDate) return false;

    const due = startOfDay(new Date(invoice.dueDate));
    if (Number.isNaN(due.getTime())) return false;

    const today = startOfDay(referenceDate);
    return due.getTime() < today.getTime();
}

/** Hitung jatuh tempo = tanggal invoice + tempo hari. */
export function calculateDueDate(invoiceDate: Date, termDays: number): Date {
    const safeTerm = Number.isFinite(termDays) && termDays >= 0 ? termDays : 0;
    return addDays(invoiceDate, safeTerm);
}

/**
 * Cek apakah invoice (AP / AR) sudah lewat jatuh tempo.
 * True hanya jika hari ini sudah melewati dueDate dan belum lunas/selesai
 * (OVERDUE atau UNPAID/PARTIAL yang telah melewati tanggal jatuh tempo).
 * Status PAID, CANCELLED, dan DRAFT dikecualikan.
 */
export function isInvoiceOverdue(
    dueDate: Date | string | null | undefined,
    status?: string | null,
): boolean {
    if (!status) return false;
    const s = status.toUpperCase();
    if (s === 'PAID' || s === 'CANCELLED' || s === 'DRAFT') return false;
    if (s === 'OVERDUE') return true;

    if (!dueDate) return false;
    const due = startOfDay(new Date(dueDate));
    const today = startOfDay(new Date());
    return due.getTime() < today.getTime();
}
