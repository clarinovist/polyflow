import { addDays, startOfDay } from "date-fns";

/** Opsi tempo pembayaran supplier. value = jumlah hari, 0 = Cash. */
export const PAYMENT_TERM_OPTIONS = [
  { value: 0, label: "Cash / 0 hari" },
  { value: 7, label: "7 hari" },
  { value: 14, label: "14 hari" },
  { value: 30, label: "30 hari" },
  { value: 45, label: "45 hari" },
  { value: 60, label: "60 hari" },
] as const;

export type PaymentTermOptionValue = (typeof PAYMENT_TERM_OPTIONS)[number]["value"];

export const DEFAULT_PAYMENT_TERM_DAYS = 30;

/** Hitung jatuh tempo = tanggal invoice + tempo hari. */
export function calculateDueDate(invoiceDate: Date, termDays: number): Date {
  const safeTerm = Number.isFinite(termDays) && termDays >= 0 ? termDays : 0;
  return addDays(invoiceDate, safeTerm);
}

/**
 * Cek apakah invoice sudah lewat jatuh tempo.
 * Merah hanya jika hari ini sudah melewati dueDate dan belum lunas (PAID/CANCELLED/DRAFT dikecualikan).
 */
export function isInvoiceOverdue(
  dueDate: Date | string | null | undefined,
  status?: string | null,
): boolean {
  if (!dueDate) return false;
  if (!status) return false;
  const s = status.toUpperCase();
  if (s === "PAID" || s === "CANCELLED" || s === "DRAFT") return false;

  const due = startOfDay(new Date(dueDate));
  const today = startOfDay(new Date());
  return due.getTime() < today.getTime();
}

/** Helper untuk filter/sort overdue di list. */
export function isOverdueByDate(
  dueDate: Date | string | null | undefined,
  status?: string | null,
): boolean {
  return isInvoiceOverdue(dueDate, status);
}
