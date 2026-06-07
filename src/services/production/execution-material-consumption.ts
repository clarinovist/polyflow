import { MovementType, Prisma } from '@prisma/client';

import { AccountingService } from '@/services/accounting/accounting-service';
import { InventoryCoreService } from '@/services/inventory/core-service';

import { resolveMaterialLocation } from './execution-material-location';
import type { ConsumptionRule, MaterialLike, OutputBackflushContext, ProductionExecutionOrder } from './execution-types';

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

function resolveConsumptionRule(item: MaterialLike): ConsumptionRule {
    const attributes = item.productVariant?.attributes;

    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
        return 'PROPORTIONAL';
    }

    const rule = (attributes as Record<string, unknown>).consumptionRule;
    if (rule === 'FLOOR_ENTERED_BAL' || rule === 'CEIL_ENTERED_BAL') {
        return rule;
    }

    return 'PROPORTIONAL';
}

export function resolveBackflushQuantity(params: {
    item: MaterialLike;
    order: ProductionExecutionOrder;
    totalConsumed: number;
    isUsingPlanned: boolean;
    outputContext?: OutputBackflushContext;
}) {
    const { item, order, totalConsumed, isUsingPlanned, outputContext } = params;

    const ratio = isUsingPlanned
        ? Number(item.quantity) / Number(order.plannedQuantity)
        : Number(item.quantity) / Number(order.bom.outputQuantity);

    const enteredQuantity = outputContext?.enteredQuantity;
    const rule = resolveConsumptionRule(item);

    if (
        order.bom?.category === 'PACKING' &&
        outputContext?.enteredUnit === 'BAL' &&
        typeof enteredQuantity === 'number' &&
        Number.isFinite(enteredQuantity) &&
        enteredQuantity > 0 &&
        enteredQuantity <= 10000
    ) {
        if (rule === 'FLOOR_ENTERED_BAL') {
            return Math.floor(enteredQuantity);
        }

        if (rule === 'CEIL_ENTERED_BAL') {
            return Math.ceil(enteredQuantity);
        }
    }

    return totalConsumed * ratio;
}

export async function backflushMaterials(params: {
    tx: Prisma.TransactionClient;
    order: ProductionExecutionOrder;
    productionOrderId: string;
    totalConsumed: number;
    reference: string;
    userId?: string;
    outputContext?: OutputBackflushContext;
}) {
    const { tx, order, productionOrderId, totalConsumed, reference, userId, outputContext } = params;
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
        const qtyToDeduct = resolveBackflushQuantity({
            item,
            order,
            totalConsumed,
            isUsingPlanned,
            outputContext,
        });

        if (qtyToDeduct <= 0.0001) {
            continue;
        }

        const resolvedRule = resolveConsumptionRule(item);
        if (resolvedRule !== 'PROPORTIONAL' && outputContext?.enteredUnit === 'BAL' && outputContext.enteredQuantity != null) {
            const entered = outputContext.enteredQuantity;
            const expected = Math.floor(entered);
            if (qtyToDeduct > expected * 1.1) {
                console.warn(
                    `[Backflush] Variance warning: deducted ${qtyToDeduct} > expected ${expected} ` +
                    `(+${((qtyToDeduct / expected - 1) * 100).toFixed(0)}%) | ` +
                    `Material: ${item.productVariant?.name ?? item.productVariantId} | ` +
                    `Entered: ${entered} BAL | WO: ${order.orderNumber}`
                );
            }
            console.log(
                `[Backflush] Rule: ${resolvedRule} | ` +
                `Material: ${item.productVariant?.name ?? item.productVariantId} | ` +
                `Entered: ${entered} ${outputContext.enteredUnit} | ` +
                `Deducted: ${qtyToDeduct} ${item.productVariant?.primaryUnit ?? 'units'} | ` +
                `WO: ${order.orderNumber}`
            );
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
