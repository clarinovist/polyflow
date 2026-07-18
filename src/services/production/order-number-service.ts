import { Prisma } from '@prisma/client';
import { ConflictError } from '@/lib/errors/errors';
import { toBusinessDateString } from '@/lib/utils/timezone';

/**
 * Build a sequential, human-readable order number per WIB business day.
 * Format: `<prefix>-<YYMMDD>-<NNN>` e.g. `WO-260718-001`.
 *
 * The daily sequence is derived from the highest existing number that shares
 * the same date prefix within the current transaction, so numbers stay stable
 * and easy for admins to scan. Uniqueness is still enforced by the DB, and the
 * caller retries on the rare P2002 collision (concurrent create in the same ms).
 */
async function buildOrderNumber(
    tx: Prisma.TransactionClient,
    prefix: string,
): Promise<string> {
    const datePart = toBusinessDateString(new Date()).slice(2).replace(/-/g, '');
    const dailyPrefix = `${prefix}-${datePart}-`;

    const lastOrder = await tx.productionOrder.findFirst({
        where: { orderNumber: { startsWith: dailyPrefix } },
        orderBy: { orderNumber: 'desc' },
        select: { orderNumber: true },
    });

    let nextNumber = 1;
    if (lastOrder?.orderNumber) {
        const numPart = parseInt(lastOrder.orderNumber.slice(dailyPrefix.length), 10);
        if (!isNaN(numPart)) nextNumber = numPart + 1;
    }

    return `${dailyPrefix}${nextNumber.toString().padStart(3, '0')}`;
}

function isOrderNumberUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
        && Array.isArray(error.meta?.target)
        && error.meta.target.includes('orderNumber');
}

export async function createProductionOrderWithGeneratedNumber(
    tx: Prisma.TransactionClient,
    data: Omit<Prisma.ProductionOrderCreateInput, 'orderNumber'>,
    options?: {
        prefix?: string;
        maxAttempts?: number;
    }
) {
    const prefix = options?.prefix ?? 'WO';
    const maxAttempts = options?.maxAttempts ?? 5;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            return await tx.productionOrder.create({
                data: {
                    ...data,
                    orderNumber: await buildOrderNumber(tx, prefix),
                }
            });
        } catch (error) {
            if (isOrderNumberUniqueViolation(error) && attempt < maxAttempts - 1) {
                continue;
            }

            throw error;
        }
    }

    throw new ConflictError('Failed to generate a unique production order number after multiple attempts.');
}