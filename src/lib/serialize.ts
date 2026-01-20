/**
 * Serializes Prisma objects for passing to Client Components.
 * Converts all Decimal values to numbers and removes hidden prototypes.
 */
export function serializeForClient<T>(data: T): T {
    return JSON.parse(
        JSON.stringify(data, (_, value) => {
            // Check if value is a Prisma Decimal (has toNumber method)
            if (typeof value === 'object' && value !== null && 'toNumber' in value) {
                return Number(value);
            }
            return value;
        })
    );
}
