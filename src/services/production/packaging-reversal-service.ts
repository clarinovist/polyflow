import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { reversePackagingJournal } from '@/services/accounting/production-packaging-reversal';
import { getActorUserId } from '@/lib/core/actor-context';
import { logActivity } from '@/lib/tools/audit';

/** Reverse exact source movements, never time-adjacent production. Caller owns tx. */
export async function reversePackagedExecution(tx: Prisma.TransactionClient, executionId: string, productionOrderId: string) {
    const userId = getActorUserId();
    if (!userId) throw new BusinessRuleError('Aktor pembatalan wajib tersedia.');
    await tx.$queryRaw`SELECT id FROM "ProductionOrder" WHERE id = ${productionOrderId} FOR UPDATE`;
    const execution = await tx.productionExecution.findUniqueOrThrow({ where: { id: executionId } });
    if (execution.status === 'VOIDED') throw new BusinessRuleError('Eksekusi sudah dibatalkan.');
    const movements = await tx.stockMovement.findMany({
        where: { productionExecutionId: executionId, reversalOfId: null },
        orderBy: [{ type: 'asc' }, { id: 'asc' }],
    });
    if (!movements.length && execution.quantityProduced?.gt(0)) throw new BusinessRuleError('Sumber transaksi hasil tidak lengkap.');
    for (const move of movements) {
        if (await tx.stockMovement.findUnique({ where: { reversalOfId: move.id } })) {
            throw new BusinessRuleError('Transaksi sumber sudah dibalik.');
        }
        if (move.type !== 'IN' && move.type !== 'OUT') throw new BusinessRuleError('Jenis transaksi hasil tidak dapat dibalik otomatis.');
        const locationId = (move.type === 'IN' ? move.toLocationId : move.fromLocationId)!;
        if (!locationId || move.cost == null) throw new BusinessRuleError('Snapshot sumber/biaya tidak lengkap.');
        if (move.type === 'IN') {
            await InventoryCoreService.validateAndLockStock(tx, locationId, move.productVariantId, Number(move.quantity));
            const downstream = await tx.stockMovement.findFirst({ where: {
                productVariantId: move.productVariantId, fromLocationId: locationId,
                createdAt: { gte: move.createdAt }, type: { in: ['OUT', 'TRANSFER'] },
                OR: [{ productionExecutionId: null }, { productionExecutionId: { not: executionId } }],
            } });
            if (downstream) throw new BusinessRuleError('Hasil sudah dipindahkan/digunakan. Balik transaksi lanjutan terlebih dahulu.');
            const inventory = await tx.inventory.findUniqueOrThrow({ where: {
                locationId_productVariantId: { locationId, productVariantId: move.productVariantId },
            } });
            const remainingQty = inventory.quantity.minus(move.quantity);
            const remainingValue = inventory.quantity.mul(inventory.averageCost ?? 0).minus(move.quantity.mul(move.cost));
            if (remainingValue.lt(-0.01) || (remainingQty.isZero() && remainingValue.abs().gt(0.01))) {
                throw new BusinessRuleError('Nilai stok sudah berubah. Rekonsiliasi diperlukan sebelum pembatalan.');
            }
            await tx.inventory.update({ where: { id: inventory.id }, data: {
                quantity: remainingQty,
                averageCost: remainingQty.gt(0) ? Prisma.Decimal.max(remainingValue, 0).div(remainingQty).toDecimalPlaces(4) : 0,
            } });
        } else {
            await InventoryCoreService.incrementStockWithCost(tx, locationId, move.productVariantId, Number(move.quantity), Number(move.cost));
        }
        const reversal = await tx.stockMovement.create({ data: {
            type: move.type === 'IN' ? 'OUT' : 'IN', productVariantId: move.productVariantId,
            fromLocationId: move.type === 'IN' ? locationId : null,
            toLocationId: move.type === 'OUT' ? locationId : null,
            quantity: move.quantity, cost: move.cost, companyOwned: move.companyOwned, packagingOwnerCustomerId: move.packagingOwnerCustomerId,
            productionOrderId, productionExecutionId: executionId, reversalOfId: move.id,
            reference: `VOID: ${move.reference ?? move.id}`,
        } });
        await reversePackagingJournal(tx, move, reversal, userId);
    }
    const issues = await tx.materialIssue.findMany({ where: { productionExecutionId: executionId, status: 'ISSUED' } });
    for (const issue of issues) {
        if (issue.stagedSourceId) await tx.materialIssue.update({ where: { id: issue.stagedSourceId }, data: { quantity: { increment: issue.quantity } } });
        await tx.materialIssue.update({ where: { id: issue.id }, data: { status: 'VOIDED' } });
    }
    await logActivity({ userId, action: 'VOID_PACKAGED_OUTPUT', entityType: 'ProductionExecution', entityId: executionId, details: 'Pembatalan berdasarkan transaksi sumber kemasan/hasil.', tx });
    return movements;
}
