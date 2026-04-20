import { MovementType, Prisma } from '@prisma/client';

import { AccountingService } from '@/services/accounting/accounting-service';
import { InventoryCoreService } from '@/services/inventory/core-service';

import { resolveMaterialLocation } from './execution-material-location';
import type { MaterialLike, ProductionExecutionOrder } from './execution-types';

async function resolveSourceUnitCost(
    tx: Prisma.TransactionClient,
    locationId: string,
    productVariantId: string,
    isMaklon: boolean
) {
    const sourceInventory = await tx.inventory.findUnique({
        where: { locationId_productVariantId: { locationId, productVariantId } },
        select: { averageCost: true, productVariant: { select: { standardCost: true, buyPrice: true } } }
    });

    let sourceUnitCost = Number(sourceInventory?.averageCost ?? 0);
    if (sourceUnitCost === 0 && !isMaklon) {
        sourceUnitCost = Number(sourceInventory?.productVariant?.standardCost ?? 0) ||
            Number(sourceInventory?.productVariant?.buyPrice ?? 0);
    }

    return sourceUnitCost;
}

export async function backflushMaterials(params: {
    tx: Prisma.TransactionClient;
    order: ProductionExecutionOrder;
    productionOrderId: string;
    totalConsumed: number;
    reference: string;
    userId?: string;
}) {
    const { tx, order, productionOrderId, totalConsumed, reference, userId } = params;
    if (totalConsumed <= 0) {
        return;
    }

    const itemsToBackflush = order.plannedMaterials.length > 0 ? order.plannedMaterials : (order.bom?.items || []);
    const isUsingPlanned = order.plannedMaterials.length > 0;

    if (itemsToBackflush.length === 0) {
        return;
    }

    for (const item of itemsToBackflush as MaterialLike[]) {
        const consumptionLocationId = await resolveMaterialLocation(tx, order, item.productVariantId);
        const ratio = isUsingPlanned
            ? Number(item.quantity) / Number(order.plannedQuantity)
            : Number(item.quantity) / Number(order.bom.outputQuantity);
        const qtyToDeduct = totalConsumed * ratio;

        if (qtyToDeduct <= 0.0001) {
            continue;
        }

        await InventoryCoreService.validateAndLockStock(tx, consumptionLocationId, item.productVariantId, qtyToDeduct);
        await InventoryCoreService.deductStock(tx, consumptionLocationId, item.productVariantId, qtyToDeduct);

        const sourceUnitCost = await resolveSourceUnitCost(tx, consumptionLocationId, item.productVariantId, order.isMaklon);

        const movement = await tx.stockMovement.create({
            data: {
                type: MovementType.OUT,
                productVariantId: item.productVariantId,
                fromLocationId: consumptionLocationId,
                quantity: qtyToDeduct,
                cost: sourceUnitCost > 0 ? sourceUnitCost : undefined,
                reference,
                productionOrderId
            }
        });
        await AccountingService.recordInventoryMovement(movement, tx);

        await tx.materialIssue.create({
            data: {
                productionOrderId,
                productVariantId: item.productVariantId,
                quantity: qtyToDeduct,
                locationId: consumptionLocationId,
                createdById: userId
            }
        });
    }
}