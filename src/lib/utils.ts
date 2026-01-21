import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupiah(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Helper to serialize Prisma objects (especially Decimals) for Client Components
 * converting them to plain numbers/strings to match Next.js serialization requirements.
 */
export function serializeData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date || (typeof obj === 'object' && obj !== null && 'toISOString' in obj && typeof (obj as { toISOString: unknown }).toISOString === 'function')) {
    return (obj as { toISOString: () => string }).toISOString() as unknown as T;
  }

  // Handle Prisma Decimal
  const potentialDecimal = obj as { toNumber?: () => number; toString?: () => string; constructor?: { name?: string }; _hex?: unknown };
  if (typeof potentialDecimal.toNumber === 'function') {
    return potentialDecimal.toNumber() as unknown as T;
  }
  if (typeof potentialDecimal.toString === 'function' && (potentialDecimal.constructor?.name === 'Decimal' || potentialDecimal._hex !== undefined)) {
    return parseFloat(potentialDecimal.toString()) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeData) as unknown as T;
  }

  const serialized: Record<string, unknown> = {};
  const objRecord = obj as Record<string, unknown>;
  for (const key in objRecord) {
    if (Object.prototype.hasOwnProperty.call(objRecord, key)) {
      serialized[key] = serializeData(objRecord[key]);
    }
  }
  return serialized as T;
}
