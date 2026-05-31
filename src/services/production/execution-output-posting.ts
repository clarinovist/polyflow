import { MovementType, Prisma } from '@prisma/client';

import { AccountingService } from '@/services/accounting/accounting-service';
import { InventoryCoreService } from '@/services/inventory/core-service';

import { ProductionCostService } from './cost-service';
import type { ProductionExecutionOrder } from './execution-types';

export async function recordFinishedGoodsOutput(params: {
    tx: Prisma.TransactionClient;
    productionOrderId: string;
    order: ProductionExecutionOrder;
    quantityProduced: number;
    reference: string;
}) {
    const { tx, productionOrderId, order, quantityProduced, reference } = params;
    if (quantityProduced <= 0) {
        return;
    }

    const locationId = order.locationId;
    const outputVariantId = order.bom.productVariantId;

    let unitCost = 0;
    try {
        unitCost = await ProductionCostService.calculateBatchCOGM(productionOrderId, tx);
    } catch (error) {
        console.warn('COGM Calc failed', error);
    }

    if (unitCost > 0) {
        await InventoryCoreService.incrementStockWithCost(tx, locationId, outputVariantId, quantityProduced, unitCost);
    } else {
        await InventoryCoreService.incrementStock(tx, locationId, outputVariantId, quantityProduced);
    }

    const movement = await tx.stockMovement.create({
        data: {
            type: MovementType.IN,
            productVariantId: outputVariantId,
            toLocationId: locationId,
            quantity: quantityProduced,
            cost: unitCost,
            reference,
            productionOrderId
        }
    });
    await AccountingService.recordInventoryMovement(movement, tx);
}

/**
 * @deprecated DELEGATED: Inventory/Production journal entries are recorded as a single source of truth
 * directly under the Prisma transaction in `recordFinishedGoodsOutput` using `AccountingService.recordInventoryMovement`.
 * This method is now a no-op to prevent duplicate posting risks.
 */
export async function triggerProductionOutputJournal(_executionId: string, _quantityProduced: number) {
    // No-op: delegated to AccountingService.recordInventoryMovement inside transaction.
    return;
}
