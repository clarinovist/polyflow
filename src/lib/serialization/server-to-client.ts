/**
 * Helper to serialize Prisma objects (especially Decimals and Dates) for Next.js Client Components.
 * Converts them to plain numbers/strings/ISO strings recursively to ensure they are fully JSON-serializable
 * without triggering "Only plain objects can be passed to Client Components" errors.
 */
import type { Serialized } from '@/lib/types/serialized';

export function serializeData<T>(obj: T): Serialized<T> {
    if (obj === null || obj === undefined) {
        return obj as Serialized<T>;
    }

    if (typeof obj !== 'object') {
        return obj as Serialized<T>;
    }

    // Handle Date objects
    if (obj instanceof Date || (typeof obj === 'object' && 'toISOString' in obj && typeof (obj as { toISOString: unknown }).toISOString === 'function')) {
        return (obj as { toISOString: () => string }).toISOString() as Serialized<T>;
    }

    // Handle Prisma Decimal objects or other custom decimal/bignumber classes safely.
    // NOTE: Do NOT rely on constructor.name — it gets minified in production builds.
    const potentialDecimal = obj as {
        toNumber?: () => number;
        toString?: () => string;
        _hex?: unknown;
        d?: unknown;
    };

    // Duck-type Decimal: has toNumber() that returns a valid number
    if (typeof potentialDecimal.toNumber === 'function') {
        try {
            const num = potentialDecimal.toNumber();
            if (typeof num === 'number' && !isNaN(num)) {
                return num as Serialized<T>;
            }
        } catch {
            // Fall through to toString fallback
        }
    }

    // Fallback: has toString() plus Prisma Decimal internal markers (_hex or digit array d)
    if (typeof potentialDecimal.toString === 'function' &&
        (Array.isArray(potentialDecimal.d) || potentialDecimal._hex !== undefined)) {
        const val = parseFloat(potentialDecimal.toString());
        return (isNaN(val) ? potentialDecimal.toString() : val) as Serialized<T>;
    }

    // Handle arrays recursively
    if (Array.isArray(obj)) {
        return obj.map(serializeData) as Serialized<T>;
    }

    // Handle plain objects recursively
    const serialized: Record<string, unknown> = {};
    const objRecord = obj as Record<string, unknown>;
    for (const key in objRecord) {
        if (Object.prototype.hasOwnProperty.call(objRecord, key)) {
            serialized[key] = serializeData(objRecord[key]);
        }
    }
    return serialized as Serialized<T>;
}
