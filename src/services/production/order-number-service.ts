import { Prisma } from '@prisma/client';

function buildOrderNumber(prefix: string, productVariantId?: string): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    const variantPart = productVariantId?.slice(0, 4).toUpperCase();

    return variantPart
        ? `${prefix}-${variantPart}-${timestamp}${randomPart}`
        : `${prefix}-${timestamp}${randomPart}`;
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
        productVariantId?: string;
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
                    orderNumber: buildOrderNumber(prefix, options?.productVariantId),
                }
            });
        } catch (error) {
            if (isOrderNumberUniqueViolation(error) && attempt < maxAttempts - 1) {
                continue;
            }

            throw error;
        }
    }

    throw new Error('Failed to generate a unique production order number.');
}