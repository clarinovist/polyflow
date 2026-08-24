/**
 * Serialized<T> — Recursively transforms Prisma types to JSON-serializable types.
 *
 * - Date → string (ISO)
 * - Decimal → number
 * - Nested objects/arrays handled recursively
 *
 * Usage: serializeData(obj) returns Serialized<typeof obj>
 */

// Prisma Decimal has these internal markers
type PrismaDecimal = {
    d: number[];
    toNumber(): number;
    toString(): string;
};

// Check if a type looks like a Prisma Decimal
type _IsDecimal<T> = T extends { d: number[]; toNumber(): number }
    ? true
    : false;

/**
 * Recursively serialize a type for client components.
 */
export type Serialized<T> = T extends Date
    ? string
    : T extends PrismaDecimal
      ? number
      : T extends Array<infer U>
        ? Serialized<U>[]
        : T extends object
          ? { [K in keyof T]: Serialized<T[K]> }
          : T;