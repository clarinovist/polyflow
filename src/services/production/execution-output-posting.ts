import { MovementType, Prisma } from '@prisma/client';

import { AccountingService } from '@/services/accounting/accounting-service';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { calculateBomCost } from '@/lib/utils/production-utils';

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

    // ── Cost Resolution Chain ──────────────────────────────────────────
    // 1. Actual COGM from material issues + conversion costs
    // 2. Variant's saved cost basis (standardCost → buyPrice → price)
    // 3. Estimated from BOM recipe (last resort before zero)
    let unitCost = 0;

    try {
        unitCost = await ProductionCostService.calculateBatchCOGM(productionOrderId, tx);
    } catch (error) {
        console.warn(`COGM calc failed for ${productionOrderId}:`, error);
    }

    if (unitCost <= 0) {
        const variant = await tx.productVariant.findUnique({
            where: { id: outputVariantId },
            select: { standardCost: true, buyPrice: true, price: true },
        });
        unitCost = Number(variant?.standardCost ?? variant?.buyPrice ?? variant?.price ?? 0);
        if (unitCost > 0) {
            console.warn(
                `COGM=0 for ${productionOrderId}, fallback to variant cost basis=${unitCost}`,
            );
        }
    }

    if (unitCost <= 0) {
        // Estimate from BOM recipe so production output is never zero-cost
        const bom = await tx.bom.findFirst({
            where: { productVariantId: outputVariantId, isDefault: true, isActive: true },
            select: {
                outputQuantity: true,
                items: {
                    select: {
                        quantity: true,
                        scrapPercentage: true,
                        productVariant: {
                            select: { standardCost: true, buyPrice: true, price: true },
                        },
                    },
                },
            },
        });
        if (bom && bom.items.length > 0) {
            const totalCost = calculateBomCost(bom.items);
            const outputQty = Number(bom.outputQuantity || 1);
            unitCost = outputQty > 0 ? totalCost / outputQty : totalCost;
            if (unitCost > 0) {
                console.warn(
                    `COGM=0, no variant cost for ${productionOrderId}, fallback to BOM estimate=${unitCost}`,
                );
            }
        }
    }

    if (unitCost <= 0) {
        console.error(
            `CRITICAL: No cost basis found for production output ${productionOrderId} ` +
            `(variant ${outputVariantId}). Recording at zero cost — inventory avgCost will be diluted.`,
        );
    }

    // ── Inventory Posting ──────────────────────────────────────────────
    // Always use incrementStockWithCost so averageCost is recalculated,
    // even when unitCost is 0 (avoids stale avgCost from old stock opname).
    await InventoryCoreService.incrementStockWithCost(
        tx, locationId, outputVariantId, quantityProduced, unitCost,
    );

    const movement = await tx.stockMovement.create({
        data: {
            type: MovementType.IN,
            productVariantId: outputVariantId,
            toLocationId: locationId,
            quantity: quantityProduced,
            cost: unitCost,
            reference,
            productionOrderId,
        },
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
