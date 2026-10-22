import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { assertPackagingGroupTotal, packagingGroupCosts } from '@/lib/production/packaging-policy';
import { packagedOutputSchema, type PackagedOutputValues } from '@/lib/schemas/production-packaging';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { consumeActualPackaging } from './packaging-consumption-service';
import { ProductionCostService } from './cost-service';
import type { ProductionExecutionOrder } from './execution-types';

export async function validatePackagedOutput(tx: Prisma.TransactionClient, order: ProductionExecutionOrder, input: PackagedOutputValues, total: number) {
    const data = packagedOutputSchema.parse(input);
    const outputLocation = await tx.location.findUniqueOrThrow({ where: { id: order.locationId } });
    if (outputLocation.packagingOwnerCustomerId) throw new BusinessRuleError('Lokasi titipan kemasan tidak boleh menjadi lokasi hasil produksi.');
    if (order.isMaklon && outputLocation.locationType !== 'CUSTOMER_OWNED') throw new BusinessRuleError('Hasil maklon harus disimpan di lokasi milik pelanggan, bukan stok perusahaan.');
    if (!order.isMaklon && outputLocation.locationType !== 'INTERNAL') throw new BusinessRuleError('Hasil produksi perusahaan harus disimpan di lokasi internal.');
    assertPackagingGroupTotal(data.groups, total);
    const base = await tx.productVariant.findUniqueOrThrow({ where: { id: order.bom.productVariantId } });
    const options = await tx.productionPackagingOption.findMany({
        where: { baseVariantId: base.id }, include: { outputVariant: true },
    });
    const destinations = await tx.productionOrder.findUniqueOrThrow({ where: { id: order.id }, select: {
        requestedOutputVariantId: true, maklonCustomerId: true, customerDestinations: { select: { customerId: true } }, salesOrder: { select: { customerId: true } },
    } });
    const allowedOwners = new Set([destinations.maklonCustomerId, destinations.salesOrder?.customerId, ...destinations.customerDestinations.map((item) => item.customerId)].filter(Boolean));
    for (const group of data.groups) {
        if (destinations.requestedOutputVariantId && group.productVariantId !== destinations.requestedOutputVariantId) throw new BusinessRuleError('Merek hasil tidak sesuai SKU yang diminta SPK/pesanan.');
        for (const row of group.packaging) {
            if (row.ownerCustomerId && !allowedOwners.has(row.ownerCustomerId)) throw new BusinessRuleError('Pemilik kemasan titipan harus terdaftar sebagai pelanggan tujuan SPK.');
        }
        const option = options.find((item) => item.outputVariantId === group.productVariantId);
        if (group.productVariantId !== base.id && !option) throw new BusinessRuleError('Merek hasil belum dipetakan ke produk dasar.');
        const output = option?.outputVariant ?? base;
        if (output.archivedAt || output.productId !== base.productId || output.primaryUnit !== base.primaryUnit ||
            output.salesUnit !== base.salesUnit || !output.conversionFactor.equals(base.conversionFactor)) {
            throw new BusinessRuleError('Produk hasil harus memiliki produk dasar dan satuan yang sama.');
        }
        if (option?.labelVariantId && !group.packaging.some((row) => row.productVariantId === option.labelVariantId)) {
            throw new BusinessRuleError('Etiket untuk merek hasil ini wajib dicatat.');
        }
        const otherLabels = options.filter((item) => item.labelVariantId && item.labelVariantId !== option?.labelVariantId).map((item) => item.labelVariantId);
        if (group.packaging.some((row) => otherLabels.includes(row.productVariantId))) {
            throw new BusinessRuleError('Etiket tidak sesuai dengan merek hasil.');
        }
    }
    const ids = [...new Set(data.groups.flatMap((group) => group.packaging.map((row) => row.productVariantId)))];
    const effective = order.plannedMaterials.length ? order.plannedMaterials : order.bom.items;
    const plannedPackaging = await tx.productVariant.findMany({ where: {
        id: { in: effective.map((item) => item.productVariantId) }, product: { productType: 'PACKAGING' },
    }, select: { id: true } });
    if (total === 0) ids.push(...plannedPackaging.map((item) => item.id));
    if (total > 0 && plannedPackaging.some((item) => !ids.includes(item.id))) {
        throw new BusinessRuleError('Catat seluruh kemasan dalam rencana sebagai pemakaian aktual agar tidak terhitung ganda.');
    }
    const conflicting = await tx.stockMovement.findFirst({ where: {
        productionOrderId: order.id, type: 'OUT', productionExecutionId: null,
    } });
    if (conflicting) throw new BusinessRuleError('Kemasan sudah dikonsumsi melalui jalur lama/manual. Selesaikan SPK lama sebelum memakai pencatatan aktual.');
    return { data, ids };
}

export async function postPackagedOutput(tx: Prisma.TransactionClient, order: ProductionExecutionOrder, executionId: string, data: PackagedOutputValues, userId?: string) {
    const consumption: Awaited<ReturnType<typeof consumeActualPackaging>>[] = [];
    for (const group of data.groups) {
        consumption.push(await consumeActualPackaging(tx, executionId, order.id, group.packaging, userId));
    }
    const groups = data.groups.map((group, index) => ({
        quantity: group.quantity,
        packagingCost: consumption[index].reduce((sum, row) => sum.plus(row.cost), new Prisma.Decimal(0)),
    }));
    // Preserve the existing order's conversion-cost basis, but capitalize only
    // the remaining value, NOT the cumulative average times just the new output.
    const orderCost = await ProductionCostService.calculateBatchTotalCost(order.id, tx);
    const priorGroups = await tx.productionOutputGroup.findMany({ where: {
        execution: { productionOrderId: order.id, status: { not: 'VOIDED' } },
    } });
    const alreadyPosted = priorGroups.reduce((sum, group) => sum.plus(group.quantity.mul(group.unitCost)), new Prisma.Decimal(0));
    const packagingCost = groups.reduce((sum, group) => sum.plus(group.packagingCost), new Prisma.Decimal(0));
    const remainingProcessCost = new Prisma.Decimal(orderCost).minus(alreadyPosted).minus(packagingCost);
    if (remainingProcessCost.lt(-0.01)) throw new BusinessRuleError('Biaya SPK berubah di bawah nilai hasil yang sudah diposting. Rekonsiliasi diperlukan.');
    const costs = packagingGroupCosts(Prisma.Decimal.max(remainingProcessCost, 0), groups);
    for (let index = 0; index < data.groups.length; index++) {
        const group = data.groups[index];
        // Maklon output remains customer property. Track service cost in the
        // result group but never capitalize the customer's product as our asset.
        const stockUnitCost = order.isMaklon ? new Prisma.Decimal(0) : costs[index].unitCost;
        await InventoryCoreService.incrementStockWithCost(tx, order.locationId, group.productVariantId, group.quantity, stockUnitCost.toNumber());
        const movement = await tx.stockMovement.create({ data: {
            type: 'IN', productVariantId: group.productVariantId, toLocationId: order.locationId,
            quantity: group.quantity, cost: stockUnitCost,
            productionOrderId: order.id, productionExecutionId: executionId,
            companyOwned: !order.isMaklon,
            createdById: userId, reference: `PACKAGED-OUTPUT:${executionId}:${index}`,
        } });
        await AccountingService.recordInventoryMovement(movement, tx);
        const output = await tx.productionOutputGroup.create({ data: {
            executionId, position: index, productVariantId: group.productVariantId,
            quantity: group.quantity, unitCost: costs[index].unitCost, movementId: movement.id,
        } });
        for (const row of consumption[index]) await tx.productionPackagingConsumption.create({ data: {
            executionId, outputGroupId: output.id, productVariantId: row.movement.productVariantId,
            quantity: row.movement.quantity, unit: row.unit, movementId: row.movement.id,
        } });
    }
}
