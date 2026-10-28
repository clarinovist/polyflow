import { Prisma } from '@prisma/client';

/**
 * When production on an SPK actually ended: its last recorded output, so an
 * SPK closed days later still lands in the month it was produced. An SPK
 * without any output ends when it is closed (`fallback`).
 */
export async function completionEndDate(
    tx: Prisma.TransactionClient,
    productionOrderId: string,
    fallback: Date = new Date(),
): Promise<Date> {
    const lastOutput = await tx.productionExecution.aggregate({
        _max: { endTime: true },
        where: {
            productionOrderId,
            status: { not: 'VOIDED' },
            quantityProduced: { gt: 0 },
        },
    });
    return lastOutput._max.endTime ?? fallback;
}
