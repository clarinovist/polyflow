import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format number as Indonesian Rupiah.
 *
 * Accounting conventions:
 *   - Positive: Rp 1.234.567
 *   - Negative: (Rp 1.234.567)   ← parentheses, standard in accounting
 *   - Null/undefined: -
 *
 * Uses dots as thousands separator (Indonesian locale).
 * Whole numbers only (no decimals).
 */
export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';

  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);

  if (value < 0) {
    return `(${formatted})`;
  }
  return formatted;
}

/**
 * Split Rupiah into parts for aligned rendering.
 *
 * Returns { prefix, amount, isNegative } so the caller can render:
 *   "Rp" left-aligned | "25.000.000" right-aligned
 *
 * This creates clean columns where numbers always line up on the right.
 */
export function formatRupiahParts(value: number | null | undefined): {
  prefix: string;
  amount: string;
  isNegative: boolean;
} {
  if (value === null || value === undefined) {
    return { prefix: '', amount: '-', isNegative: false };
  }

  const isNegative = value < 0;
  const abs = Math.abs(value);
  const amount = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);

  return { prefix: 'Rp', amount, isNegative };
}

export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

export { serializeData } from '@/lib/serialization/server-to-client';

/**
 * Safely convert a Prisma Decimal or number to a plain number.
 * Handles: number (passthrough), Decimal objects (duck-typed), null/undefined.
 */
export function toDecimalNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;

  // Duck-type: has toNumber() (Prisma Decimal)
  const obj = value as { toNumber?: () => number };
  if (typeof obj.toNumber === 'function') {
    const num = obj.toNumber();
    return typeof num === 'number' && !isNaN(num) ? num : 0;
  }

  // Duck-type: has toString() (fallback)
  const strObj = value as { toString?: () => string };
  if (typeof strObj.toString === 'function') {
    return parseFloat(strObj.toString()) || 0;
  }

  return 0;
}
