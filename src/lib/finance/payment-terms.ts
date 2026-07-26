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

export type PaymentTermOptionValue =
    (typeof PAYMENT_TERM_OPTIONS)[number]['value'];

export const DEFAULT_PAYMENT_TERM_DAYS = 30;

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

/** Helper alias untuk filter/sort overdue di list. */
export function isOverdueByDate(
    dueDate: Date | string | null | undefined,
    status?: string | null,
): boolean {
    return isInvoiceOverdue(dueDate, status);
}
