import { Prisma } from '@prisma/client';
import { getTenantDbFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { receiveReturnInTransaction } from '@/services/finance/sales-return-receipt-service';

export type ReturnSourceSelection = {
    returnItemId: string;
    sourceMovementId: string;
}[];

export async function getReturnShipmentSources(
    tx: Prisma.TransactionClient,
    returnId: string,
) {
    const returned = await tx.salesReturn.findUnique({
        where: { id: returnId },
        include: { items: true, deliveryOrder: true },
    });
    if (!returned) throw new NotFoundError('Sales Return');
    const sources = await tx.stockMovement.findMany({
        where: {
            type: 'OUT',
            salesOrderId: returned.salesOrderId,
            productVariantId: {
                in: returned.items.map((item) => item.productVariantId),
            },
            fromLocationId: { not: null },
            toLocationId: null,
            goodsReceiptId: null,
            productionOrderId: null,
            ...(returned.deliveryOrder
                ? {
                      reference: {
                          endsWith: ` via ${returned.deliveryOrder.orderNumber}`,
                      },
                  }
                : {}),
        },
        select: {
            id: true,
            productVariantId: true,
            quantity: true,
            reference: true,
            createdAt: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 201,
    });
    if (sources.length > 200)
        throw new BusinessRuleError(
            'Terlalu banyak sumber pengiriman. Tautkan surat jalan retur terlebih dahulu.',
        );
    return returned.items.map((item) => ({
        returnItemId: item.id,
        sources: sources
            .filter(
                (source) => source.productVariantId === item.productVariantId,
            )
            .map((source) => ({
                id: source.id,
                quantity: Number(source.quantity),
                reference: source.reference ?? source.id,
                createdAt: source.createdAt.toISOString(),
            })),
    }));
}

/** Require an explicit tenant client for financial/inventory writes; no control DB fallback. */
export async function receiveSalesReturn(
    returnId: string,
    userId: string,
    selections?: ReturnSourceSelection,
) {
    const db = getTenantDbFromContext();
    if (!db)
        throw new BusinessRuleError(
            'Konteks tenant wajib untuk penerimaan retur.',
        );
    return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "SalesReturn" WHERE id = ${returnId} FOR UPDATE`;
        let lines = selections;
        if (!lines) {
            const sources = await getReturnShipmentSources(tx, returnId);
            if (sources.some((item) => item.sources.length !== 1))
                throw new BusinessRuleError(
                    'Pilih sumber pengiriman untuk setiap item retur. Sumber kosong/ambigu tidak boleh diperkirakan.',
                );
            lines = sources.map((item) => ({
                returnItemId: item.returnItemId,
                sourceMovementId: item.sources[0].id,
            }));
        }
        return receiveReturnInTransaction(
            tx,
            { returnId, receivedAt: new Date(), lines },
            userId,
        );
    });
}
