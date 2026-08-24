import { Prisma } from '@prisma/client';

export const MAX_CUSTOMER_CODE_ATTEMPTS = 5;

/**
 * Customer codes are generated via a read-then-increment query with no
 * locking (see `getNextCustomerCode`), so two concurrent requests can
 * compute the same next code. Detect that specific collision (a Postgres
 * unique violation on `code`) so callers can retry with a freshly
 * recomputed code instead of surfacing a raw DB error.
 */
function isCustomerCodeUniqueViolation(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        Array.isArray(error.meta?.target) &&
        error.meta.target.includes('code')
    );
}

export class CustomerCodeCollisionError extends Error {
    constructor() {
        super(
            `Gagal membuat kode customer unik setelah ${MAX_CUSTOMER_CODE_ATTEMPTS} percobaan`,
        );
        this.name = 'CustomerCodeCollisionError';
    }
}

/**
 * Runs `create` with a freshly generated customer code, retrying up to
 * MAX_CUSTOMER_CODE_ATTEMPTS times when the attempt collides with a code
 * committed by a concurrent request. Any other error is rethrown as-is.
 *
 * `generateCode` is passed in rather than imported directly so this module
 * has no dependency on where codes come from (and avoids a circular import
 * with `@/actions/sales/customer`, which is one of its callers).
 */
export async function createWithUniqueCustomerCode<T>(
    generateCode: () => Promise<string>,
    create: (code: string) => Promise<T>,
): Promise<T> {
    for (let attempt = 0; attempt < MAX_CUSTOMER_CODE_ATTEMPTS; attempt += 1) {
        const code = await generateCode();
        try {
            return await create(code);
        } catch (error) {
            const isLastAttempt = attempt === MAX_CUSTOMER_CODE_ATTEMPTS - 1;
            if (!isCustomerCodeUniqueViolation(error)) {
                throw error;
            }
            if (isLastAttempt) {
                throw new CustomerCodeCollisionError();
            }
            // Collision on `code` — loop and recompute a fresh one.
        }
    }

    // Unreachable: the loop above always returns or throws on its last
    // iteration. Present only to satisfy TypeScript's control-flow check.
    throw new CustomerCodeCollisionError();
}
