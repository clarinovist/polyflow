import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { assertPackagingSourceOwner } from '@/lib/production/packaging-policy';
import { packagingConsumptionSchema, type PackagingConsumptionValues } from '@/lib/schemas/production-packaging';
import { isPackagingMaterial } from '@/lib/production/packaging-material';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';

/** Caller owns transaction and order lock. Never starts an independent transaction. */
export async function consumeActualPackaging(
    tx: Prisma.TransactionClient,
    executionId: string,
    productionOrderId: string,
    rows: PackagingConsumptionValues[],
    userId?: string,
) {
    const result = [];
    for (const input of [...rows].sort((a, b) => `${a.sourceLocationId}:${a.productVariantId}`.localeCompare(`${b.sourceLocationId}:${b.productVariantId}`))) {
        const row = packagingConsumptionSchema.parse(input);
        const [source, variant] = await Promise.all([
            tx.location.findUniqueOrThrow({ where: { id: row.sourceLocationId } }),
            tx.productVariant.findUniqueOrThrow({ where: { id: row.productVariantId }, include: { product: true } }),
        ]);
        if (variant.archivedAt || !isPackagingMaterial(variant.product.productType, variant.primaryUnit)) {
            throw new BusinessRuleError('Pilih bahan kemasan atau bahan penolong aktif dengan satuan KG atau PCS/lembar.');
        }
        if ((row.unit ?? 'PCS') !== variant.primaryUnit) {
            throw new BusinessRuleError('Satuan stok kemasan berubah atau belum dimuat. Buka ulang form dan masukkan pemakaian sesuai satuan stok.');
        }
        const companyOwned = assertPackagingSourceOwner(source, row.ownerCustomerId);
        await InventoryCoreService.validateAndLockStock(tx, source.id, variant.id, row.quantity, productionOrderId);
        const inventory = await tx.inventory.findUniqueOrThrow({
            where: { locationId_productVariantId: { locationId: source.id, productVariantId: variant.id } },
        });
        // A zero custody cost is intentional, never a signal to use the master price.
        const unitCost = companyOwned ? inventory.averageCost : new Prisma.Decimal(0);
        if (unitCost == null || unitCost.lt(0)) throw new BusinessRuleError('Biaya stok kemasan belum terverifikasi.');
        await InventoryCoreService.deductStock(tx, source.id, variant.id, row.quantity);
        const movement = await tx.stockMovement.create({ data: {
            type: 'OUT', productVariantId: variant.id, fromLocationId: source.id,
            quantity: row.quantity, cost: unitCost, companyOwned, packagingOwnerCustomerId: row.ownerCustomerId,
            productionOrderId, productionExecutionId: executionId, createdById: userId,
            reference: `ACTUAL-PACKAGING:${executionId}`,
        } });
        await AccountingService.recordInventoryMovement(movement, tx);
        await allocatePackagingIssue(tx, { executionId, productionOrderId, row, userId });
        result.push({ movement, unit: variant.primaryUnit, cost: unitCost.mul(row.quantity) });
    }
    return result;
}

/** Keep staging rows so a void can restore the exact original allocation. */
async function allocatePackagingIssue(tx: Prisma.TransactionClient, data: {
    executionId: string; productionOrderId: string; row: PackagingConsumptionValues; userId?: string;
}) {
    const { executionId, productionOrderId, row, userId } = data;
    const staged = await tx.materialIssue.findMany({
        where: { productionOrderId, productVariantId: row.productVariantId, locationId: row.sourceLocationId, status: 'STAGED' },
        orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
    });
    let remaining = new Prisma.Decimal(row.quantity);
    for (const source of staged) {
        if (remaining.lte(0)) break;
        const quantity = Prisma.Decimal.min(remaining, source.quantity);
        if (quantity.lte(0)) continue;
        await tx.materialIssue.update({ where: { id: source.id }, data: { quantity: { decrement: quantity } } });
        await tx.materialIssue.create({ data: {
            productionOrderId, productVariantId: row.productVariantId, locationId: row.sourceLocationId,
            productionExecutionId: executionId, stagedSourceId: source.id, quantity, createdById: userId,
        } });
        remaining = remaining.minus(quantity);
    }
    if (remaining.gt(0)) await tx.materialIssue.create({ data: {
        productionOrderId, productVariantId: row.productVariantId, locationId: row.sourceLocationId,
        productionExecutionId: executionId, quantity: remaining, createdById: userId,
    } });
}
