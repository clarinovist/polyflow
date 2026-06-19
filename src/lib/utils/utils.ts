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
 * No decimals for whole numbers, up to 2 decimals for fractional.
 */
export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';

  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(abs);

  if (value < 0) {
    return `(${formatted})`;
  }
  return formatted;
}

export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(value);
}

export { serializeData } from '@/lib/serialization/server-to-client';
