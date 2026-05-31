/**
 * Helper to serialize Prisma objects (especially Decimals and Dates) for Next.js Client Components.
 * Converts them to plain numbers/strings/ISO strings recursively to ensure they are fully JSON-serializable
 * without triggering "Only plain objects can be passed to Client Components" errors.
 */
export function serializeData<T>(obj: T): T {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj !== 'object') {
        return obj;
    }

    // Handle Date objects
    if (obj instanceof Date || (typeof obj === 'object' && 'toISOString' in obj && typeof (obj as { toISOString: unknown }).toISOString === 'function')) {
        return (obj as { toISOString: () => string }).toISOString() as unknown as T;
    }

    // Handle Prisma Decimal objects or other custom decimal/bignumber classes safely
    const potentialDecimal = obj as {
        toNumber?: () => number;
        toString?: () => string;
        constructor?: { name?: string };
        _hex?: unknown
    };
    if (typeof potentialDecimal.toNumber === 'function' && potentialDecimal.constructor?.name === 'Decimal') {
        return potentialDecimal.toNumber() as unknown as T;
    }
    if (typeof potentialDecimal.toString === 'function' && (potentialDecimal.constructor?.name === 'Decimal' || potentialDecimal._hex !== undefined)) {
        const val = parseFloat(potentialDecimal.toString());
        return (isNaN(val) ? potentialDecimal.toString() : val) as unknown as T;
    }

    // Handle arrays recursively
    if (Array.isArray(obj)) {
        return obj.map(serializeData) as unknown as T;
    }

    // Handle plain objects recursively
    const serialized: Record<string, unknown> = {};
    const objRecord = obj as Record<string, unknown>;
    for (const key in objRecord) {
        if (Object.prototype.hasOwnProperty.call(objRecord, key)) {
            serialized[key] = serializeData(objRecord[key]);
        }
    }
    return serialized as T;
}
