import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
// Helper to serialize Prisma objects (especially Decimals) for Client Components
export function serializeData(obj: any): any {
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
  if (obj && typeof obj === 'object' && typeof obj.toNumber === 'function') {
    return obj.toNumber();
  }
  if (obj && typeof obj === 'object' && typeof obj.toString === 'function' && obj.constructor?.name === 'Decimal') {
    return parseFloat(obj.toString());
  }

  // Handle already serialized decimals that might be coming as strings/numbers in some contexts
  // or specialized objects.

  if (Array.isArray(obj)) {
    return obj.map(serializeData);
  }

  const serialized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      serialized[key] = serializeData(obj[key]);
    }
  }
  return serialized;
}
