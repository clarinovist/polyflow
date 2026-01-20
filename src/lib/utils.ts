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
 * Safely serializes data to be passed to Client Components.
 * Converts Date objects to strings and BigInt/Decimal to numbers/strings.
 * Uses JSON.parse(JSON.stringify()) as a reliable fallback for cleaning objects.
 */
export function safeSerialize<T>(data: T): T {
  return JSON.parse(JSON.stringify(data, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    // Decimals often come as strings in JSON.stringify if not handled, 
    // but here we just want to ensure it's a plain object structure.
    return value;
  }));
}
// Helper to serialize Prisma objects (especially Decimals) for Client Components
export function serializeData(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  // Handle Prisma Decimal
  const potentialDecimal = obj as { toNumber?: () => number; toString?: () => string; constructor?: { name?: string } };
  if (typeof potentialDecimal.toNumber === 'function') {
    return potentialDecimal.toNumber();
  }
  if (typeof potentialDecimal.toString === 'function' && potentialDecimal.constructor?.name === 'Decimal') {
    return parseFloat(potentialDecimal.toString());
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeData);
  }

  const serialized: Record<string, unknown> = {};
  const objRecord = obj as Record<string, unknown>;
  for (const key in objRecord) {
    if (Object.prototype.hasOwnProperty.call(objRecord, key)) {
      serialized[key] = serializeData(objRecord[key]);
    }
  }
  return serialized;
}
