import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { generateEntryNumber } from '@/services/accounting/journal-posting';
import { allocateHistoricalReturnCost } from './sales-return-cost-basis';
import { requireOpenJournalPeriod } from './sales-recognition-service';

const schema = z.object({
    returnId: z.string().min(1).max(100),
    receivedAt: z.coerce.date(),
    lines: z
        .array(
            z.object({
                returnItemId: z.string().min(1),
                sourceMovementId: z.string().min(1),
            }),
        )
        .min(1)
        .max(200),
});

/**
 * Historical receipt valuation, including an empty destination's insert race.
 * ON CONFLICT never aborts the transaction; the subsequent row lock observes
 * the committed quantity/cost of any competing inventory writer.
 */
async function restockAtHistoricalValue(
    tx: Prisma.TransactionClient,
    locationId: string,
    productVariantId: string,
    quantity: Prisma.Decimal,
    value: Prisma.Decimal,
) {
    await tx.$executeRaw`INSERT INTO "Inventory" (id, "locationId", "productVariantId", quantity, "averageCost", "updatedAt")
        VALUES (${randomUUID()}, ${locationId}, ${productVariantId}, 0, 0, NOW())
        ON CONFLICT ("locationId", "productVariantId") DO NOTHING`;
    const [current] = await tx.$queryRaw<
        {
            id: string;
            quantity: Prisma.Decimal;
            averageCost: Prisma.Decimal | null;
        }[]
    >`
        SELECT id, quantity, "averageCost" FROM "Inventory"
        WHERE "locationId" = ${locationId} AND "productVariantId" = ${productVariantId} FOR UPDATE`;
    if (
        !current ||
        current.quantity.lt(0) ||
        (current.quantity.gt(0) &&
            (current.averageCost === null || current.averageCost.lt(0)))
    ) {
        throw new BusinessRuleError(
            'Saldo/valuasi persediaan tujuan belum valid. Periksa Finance sebelum menerima retur.',
        );
    }
    const totalQuantity = current.quantity.plus(quantity);
    const averageCost = current.quantity
        .mul(current.averageCost ?? 0)
        .plus(value)
        .div(totalQuantity)
        .toDecimalPlaces(4);
    await tx.inventory.update({
        where: { id: current.id },
        data: { quantity: totalQuantity, averageCost },
    });
}

/** Transaction-owned receiving core. Physical receipt and valuation only; never posts AR. */
export async function receiveReturnInTransaction(
    tx: Prisma.TransactionClient,
    input: unknown,
    userId: string,
) {
    const data = schema.parse(input);
    await tx.$queryRaw`SELECT id FROM "SalesReturn" WHERE id = ${data.returnId} FOR UPDATE`;
    const returned = await tx.salesReturn.findUnique({
        where: { id: data.returnId },
        include: {
            items: { include: { receipt: true } },
            deliveryOrder: true,
            salesOrder: { select: { customerId: true } },
        },
    });
    if (!returned) throw new NotFoundError('Sales Return');
    const ids = new Set(data.lines.map((line) => line.returnItemId));
    if (
        ids.size !== data.lines.length ||
        ids.size !== returned.items.length ||
        returned.items.some((item) => !ids.has(item.id))
    )
        throw new BusinessRuleError(
            'Alokasi penerimaan harus mencakup setiap item tepat satu kali.',
        );
    if (['RECEIVED', 'COMPLETED'].includes(returned.status)) {
        if (
            returned.items.every(
                (item) =>
                    item.receipt &&
                    data.lines.some(
                        (line) =>
                            line.returnItemId === item.id &&
                            line.sourceMovementId ===
                                item.receipt?.sourceMovementId,
                    ),
            )
        )
            return returned;
        throw new BusinessRuleError(
            'Penerimaan lama/berbeda memerlukan pemeriksaan; jangan restock ulang.',
        );
    }
    if (
        returned.status !== 'CONFIRMED' ||
        !returned.customerId ||
        returned.customerId !== returned.salesOrder.customerId
    )
        throw new BusinessRuleError(
            'Status/customer retur tidak valid untuk penerimaan.',
        );
    if (
        returned.deliveryOrder &&
        (returned.deliveryOrder.salesOrderId !== returned.salesOrderId ||
            !['SHIPPED', 'DELIVERED'].includes(returned.deliveryOrder.status))
    )
        throw new BusinessRuleError('Surat jalan retur tidak sesuai.');
    const receiptDay = toBusinessDateString(data.receivedAt);
    if (
        receiptDay < toBusinessDateString(returned.returnDate) ||
        receiptDay > toBusinessDateString(new Date())
    ) {
        throw new BusinessRuleError(
            'Tanggal penerimaan harus sesudah retur dan tidak di masa depan.',
        );
    }
    // Lock all source movements deterministically before cumulative-quantity checks.
    for (const id of [
        ...new Set(data.lines.map((line) => line.sourceMovementId)),
    ].sort()) {
        await tx.$queryRaw`SELECT id FROM "StockMovement" WHERE id = ${id} FOR UPDATE`;
    }
    const legacy = await tx.salesReturn.findFirst({
        where: {
            id: { not: returned.id },
            salesOrderId: returned.salesOrderId,
            status: { in: ['RECEIVED', 'COMPLETED'] },
            items: {
                some: {
                    productVariantId: {
                        in: returned.items.map((item) => item.productVariantId),
                    },
                    receipt: { is: null },
                },
            },
        },
        select: { id: true },
    });
    if (legacy)
        throw new BusinessRuleError(
            'Ada penerimaan retur lama tanpa alokasi sumber. Rekonsiliasi kuantitas terlebih dahulu.',
        );
    await requireOpenJournalPeriod(tx, data.receivedAt);
    // Consistent destination lock order for returns containing multiple products.
    const orderedLines = [...data.lines].sort((a, b) => {
        const left = returned.items.find((item) => item.id === a.returnItemId)!;
        const right = returned.items.find(
            (item) => item.id === b.returnItemId,
        )!;
        return (
            left.productVariantId.localeCompare(right.productVariantId) ||
            left.id.localeCompare(right.id)
        );
    });
    for (const requested of orderedLines) {
        const item = returned.items.find(
            (item) => item.id === requested.returnItemId,
        )!;
        const source = await tx.stockMovement.findUnique({
            where: { id: requested.sourceMovementId },
        });
        if (
            !source ||
            source.type !== 'OUT' ||
            source.salesOrderId !== returned.salesOrderId ||
            source.productVariantId !== item.productVariantId ||
            !source.fromLocationId ||
            source.toLocationId ||
            source.goodsReceiptId ||
            source.productionOrderId ||
            source.reference?.startsWith('VOID:')
        )
            throw new BusinessRuleError(
                'Sumber pengiriman tidak cocok dengan item/SO retur.',
            );
        if (receiptDay < toBusinessDateString(source.createdAt)) {
            throw new BusinessRuleError(
                'Tanggal penerimaan tidak boleh mendahului pengiriman asal.',
            );
        }
        if (
            returned.deliveryOrder &&
            !source.reference?.endsWith(
                ` via ${returned.deliveryOrder.orderNumber}`,
            )
        )
            throw new BusinessRuleError(
                'Sumber pengiriman tidak cocok dengan surat jalan retur.',
            );
        const reversed = await tx.stockMovement.findFirst({
            where: {
                type: 'IN',
                salesOrderId: source.salesOrderId,
                productVariantId: source.productVariantId,
                reference: {
                    startsWith: `VOID: ${source.reference ?? source.id}`,
                },
            },
            select: { id: true },
        });
        if (reversed)
            throw new BusinessRuleError('Pengiriman asal sudah dibalik.');
        const previous = await tx.salesReturnReceiptLine.aggregate({
            where: { sourceMovementId: source.id },
            _sum: { quantity: true },
        });
        const received = previous._sum.quantity ?? new Prisma.Decimal(0);
        if (received.plus(item.returnedQty).gt(source.quantity))
            throw new BusinessRuleError(
                'Kuantitas retur melebihi pengiriman asal.',
            );
        const goodPrevious = await tx.salesReturnReceiptLine.aggregate({
            where: {
                sourceMovementId: source.id,
                returnItem: { condition: 'GOOD' },
            },
            _sum: { quantity: true },
        });
        await tx.$queryRaw`SELECT id FROM "JournalEntry" WHERE "referenceId" = ${source.id} ORDER BY id FOR UPDATE`;
        const journals = await tx.journalEntry.findMany({
            where: { referenceId: source.id, status: { not: 'VOIDED' } },
            include: { lines: true },
        });
        if (item.condition === 'GOOD' && journals.length === 1) {
            const accounts = await tx.account.findMany({
                where: {
                    id: { in: journals[0].lines.map((line) => line.accountId) },
                },
            });
            const costLine = journals[0].lines.find((line) => line.debit.gt(0));
            const inventoryLine = journals[0].lines.find((line) =>
                line.credit.gt(0),
            );
            if (
                !costLine ||
                !inventoryLine ||
                !accounts.some(
                    (account) =>
                        account.id === costLine.accountId &&
                        account.type === 'EXPENSE' &&
                        account.category === 'COGS',
                ) ||
                !accounts.some(
                    (account) =>
                        account.id === inventoryLine.accountId &&
                        account.type === 'ASSET',
                ) ||
                (source.cost !== null &&
                    source.cost
                        .mul(source.quantity)
                        .toDecimalPlaces(2)
                        .minus(costLine.debit)
                        .abs()
                        .gt('0.01'))
            ) {
                throw new BusinessRuleError(
                    'Akun/nilai jurnal HPP historis tidak cocok dengan pengiriman. Pemeriksaan Finance diperlukan.',
                );
            }
        }
        const cost = allocateHistoricalReturnCost(
            {
                movement: source,
                journal: journals.length === 1 ? journals[0] : null,
            },
            (goodPrevious._sum.quantity ?? new Prisma.Decimal(0)).toString(),
            item.returnedQty.toString(),
            item.condition,
        );
        let movementId: string | null = null;
        let journalId: string | null = null;
        if (cost.restock) {
            await restockAtHistoricalValue(
                tx,
                returned.returnLocationId,
                item.productVariantId,
                item.returnedQty,
                cost.amount,
            );
            const movement = await tx.stockMovement.create({
                data: {
                    type: 'RETURN_IN',
                    productVariantId: item.productVariantId,
                    toLocationId: returned.returnLocationId,
                    quantity: item.returnedQty,
                    cost: cost.amount.div(item.returnedQty).toDecimalPlaces(4),
                    salesOrderId: returned.salesOrderId,
                    reference: `Return ${returned.returnNumber}; source ${source.id}`,
                    createdById: userId,
                    createdAt: data.receivedAt,
                },
            });
            movementId = movement.id;
            if (cost.amount.gt(0)) {
                const accounts = await tx.account.count({
                    where: {
                        id: { in: cost.lines.map((line) => line.accountId) },
                        isActive: true,
                    },
                });
                if (accounts !== 2)
                    throw new BusinessRuleError(
                        'Akun historis HPP/persediaan tidak aktif.',
                    );
                const journal = await tx.journalEntry.create({
                    data: {
                        entryNumber: await generateEntryNumber(
                            data.receivedAt,
                            tx,
                        ),
                        entryDate: data.receivedAt,
                        description: `Restock retur ${returned.returnNumber}`,
                        reference: `RETURN_STOCK:${item.id}`,
                        referenceType: 'MANUAL_ENTRY',
                        referenceId: movement.id,
                        status: 'POSTED',
                        isAutoGenerated: true,
                        createdById: userId,
                        approvedById: userId,
                        approvedAt: new Date(),
                        lines: { create: cost.lines },
                    },
                });
                journalId = journal.id;
            }
        }
        // Damaged goods remain physical receipt evidence, NOT an inventory-in movement.
        await tx.salesReturnReceiptLine.create({
            data: {
                returnItemId: item.id,
                sourceMovementId: source.id,
                movementId,
                journalId,
                quantity: item.returnedQty,
                restockValue: cost.amount,
                receivedAt: data.receivedAt,
                createdById: userId,
            },
        });
    }
    const result = await tx.salesReturn.update({
        where: { id: returned.id },
        data: { status: 'RECEIVED' },
    });
    await logActivity({
        userId,
        action: 'RECEIVE_SALES_RETURN',
        entityType: 'SalesReturn',
        entityId: returned.id,
        fromStatus: 'CONFIRMED',
        toStatus: 'RECEIVED',
        details: 'Received against original shipment/HPP; no AR credit posted',
        tx,
    });
    return result;
}
