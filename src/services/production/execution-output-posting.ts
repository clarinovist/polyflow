import { MovementType, Prisma } from '@prisma/client';

import { AccountingService } from '@/services/accounting/accounting-service';
import { AutoJournalService } from '@/services/finance/auto-journal-service';
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

export async function triggerProductionOutputJournal(executionId: string, quantityProduced: number) {
    if (quantityProduced > 0) {
        await AutoJournalService.handleProductionOutput(executionId);
    }
}