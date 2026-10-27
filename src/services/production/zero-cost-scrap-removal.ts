import { Prisma, type StockMovement } from '@prisma/client';
import { ProductionRuleViolationError } from '@/lib/errors/errors';
import { InventoryCoreService } from '@/services/inventory/core-service';

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
    const downstream = await tx.stockMovement.findFirst({ where: {
        productVariantId: receipt.productVariantId, fromLocationId: locationId,
        createdAt: { gte: receipt.createdAt }, type: { in: ['OUT', 'TRANSFER'] },
        ...(ownExecutionId
            ? { OR: [{ productionExecutionId: null }, { productionExecutionId: { not: ownExecutionId } }] }
            : {}),
    } });
    if (downstream) throw new ProductionRuleViolationError('Affal sudah dipindahkan/digunakan. Balik transaksi lanjutan terlebih dahulu.');
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
