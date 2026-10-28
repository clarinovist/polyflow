import { Prisma, type StockMovement } from '@prisma/client';
import { ProductionRuleViolationError } from '@/lib/errors/errors';
import { InventoryCoreService } from '@/services/inventory/core-service';

type DownstreamMovement = StockMovement & {
    reversalOf: StockMovement | null;
    reversedBy: { id: string } | null;
    productionExecution: { status: string } | null;
};

/** A zero-value receipt and its exact inverse cancel each other, not another output. */
function isOtherReceiptReversal(move: DownstreamMovement, receiptId: string): boolean {
    const source = move.reversalOf;
    return !!source && source.id !== receiptId && move.reversalOfId === source.id &&
        source.reversalOfId === null && move.reversedBy === null &&
        move.type === 'OUT' && source.type === 'IN' &&
        source.cost?.isZero() === true && move.cost?.isZero() === true &&
        source.quantity.gt(0) && source.quantity.eq(move.quantity) &&
        source.productVariantId === move.productVariantId &&
        source.fromLocationId === null && move.toLocationId === null &&
        source.toLocationId === move.fromLocationId &&
        !!source.productionOrderId && source.productionOrderId === move.productionOrderId &&
        source.productionExecutionId === move.productionExecutionId &&
        (move.productionExecutionId === null || move.productionExecution?.status === 'VOIDED') &&
        source.companyOwned === move.companyOwned &&
        source.packagingOwnerCustomerId === move.packagingOwnerCustomerId &&
        !source.salesOrderId && !move.salesOrderId && !source.goodsReceiptId && !move.goodsReceiptId &&
        source.createdAt <= move.createdAt;
}

/**
 * Take back an affal receipt that entered at zero allocated production cost.
 * Removing it restores the pre-receipt stock value instead of expensing the
 * current WAC. An unknown (NULL) average stays unknown: it is never
 * normalized to zero. Caller writes the reversal movement in the same tx.
 */
export async function removeZeroCostScrapReceipt(
    tx: Prisma.TransactionClient,
    receipt: StockMovement,
    ownExecutionId?: string,
) {
    const locationId = receipt.toLocationId;
    if (receipt.type !== 'IN' || !locationId || !receipt.cost?.isZero()) {
        throw new ProductionRuleViolationError('Penerimaan affal bukan penerimaan bernilai nol yang dapat dibalik.');
    }
    await InventoryCoreService.validateAndLockStock(tx, locationId, receipt.productVariantId, Number(receipt.quantity));
    // Keep the stock lock while walking candidates. Skip only proven zero-cost
    // receipt inverses, never all reversal rows or a real OUT later in history.
    let afterId: string | undefined;
    for (;;) {
        const downstream: DownstreamMovement | null = await tx.stockMovement.findFirst({
            where: {
                productVariantId: receipt.productVariantId, fromLocationId: locationId,
                createdAt: { gte: receipt.createdAt }, type: { in: ['OUT', 'TRANSFER'] },
                ...(afterId ? { id: { gt: afterId } } : {}),
                ...(ownExecutionId
                    ? { OR: [{ productionExecutionId: null }, { productionExecutionId: { not: ownExecutionId } }] }
                    : {}),
            },
            include: { reversalOf: true, reversedBy: { select: { id: true } }, productionExecution: { select: { status: true } } },
            orderBy: { id: 'asc' },
        });
        if (!downstream) break;
        if (!isOtherReceiptReversal(downstream, receipt.id)) {
            throw new ProductionRuleViolationError('Affal sudah dipindahkan/digunakan. Balik transaksi lanjutan terlebih dahulu.');
        }
        afterId = downstream.id;
    }
    const stock = await tx.inventory.findUniqueOrThrow({ where: {
        locationId_productVariantId: { locationId, productVariantId: receipt.productVariantId },
    } });
    const remainingQty = stock.quantity.minus(receipt.quantity);
    if (stock.averageCost === null) {
        await tx.inventory.update({ where: { id: stock.id }, data: { quantity: remainingQty } });
        return;
    }
    const value = stock.quantity.mul(stock.averageCost);
    if (value.lt(0) || (remainingQty.isZero() && value.abs().gt(0.01))) {
        throw new ProductionRuleViolationError('Nilai stok affal sudah berubah. Rekonsiliasi diperlukan sebelum pembatalan.');
    }
    await tx.inventory.update({ where: { id: stock.id }, data: {
        quantity: remainingQty, averageCost: remainingQty.gt(0) ? value.div(remainingQty).toDecimalPlaces(4) : 0,
    } });
}
