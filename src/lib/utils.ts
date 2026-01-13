import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
