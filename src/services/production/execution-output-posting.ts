import { MovementType, Prisma, ReservationType } from '@prisma/client';

import { AccountingService } from '@/services/accounting/accounting-service';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { calculateBomCost } from '@/lib/utils/production-utils';
import {
    createStockReservation,
    getSalesOrderResidualDemand,
} from '@/services/inventory/reservation-service';
import { isSalesStockReservationEnabled } from '@/lib/config/stock-reservation-flag';

import { ProductionCostService } from './cost-service';
import type { ProductionExecutionOrder } from './execution-types';

/**
 * Maklon output is customer property and posts no company journal. It keeps
 * the order-average service cost chain:
 * 1. Actual COGM from material issues + maklon service costs
 * 2. Variant's saved cost basis (standardCost → buyPrice → price)
 * 3. Estimated from BOM recipe (last resort before zero)
 */
async function resolveMaklonOutputCost(params: {
    tx: Prisma.TransactionClient;
    productionOrderId: string;
    outputVariantId: string;
    quantityProduced: number;
    materialRoundingAdjustment?: number;
}) {
    const { tx, productionOrderId, outputVariantId, quantityProduced } = params;
    let unitCost = 0;
    let journalTotal: number | undefined;

    try {
        const valuation = await ProductionCostService.calculateBatchOutputValuation(
            productionOrderId, quantityProduced, tx, params.materialRoundingAdjustment,
        );
        unitCost = valuation.unitCost;
        if (unitCost > 0) journalTotal = valuation.journalTotal;
    } catch (error) {
        console.warn(`COGM calc failed for ${productionOrderId}:`, error);
    }

    if (unitCost <= 0) {
        const variant = await tx.productVariant.findUnique({
            where: { id: outputVariantId },
            select: { standardCost: true, buyPrice: true, price: true },
        });
        unitCost = Number(
            variant?.standardCost ?? variant?.buyPrice ?? variant?.price ?? 0,
        );
        if (unitCost > 0) {
            console.warn(
                `COGM=0 for ${productionOrderId}, fallback to variant cost basis=${unitCost}`,
            );
        }
    }

    if (unitCost <= 0) {
        // Estimate from BOM recipe so production output is never zero-cost
        const bom = await tx.bom.findFirst({
            where: {
                productVariantId: outputVariantId,
                isDefault: true,
                isActive: true,
            },
            select: {
                outputQuantity: true,
                items: {
                    select: {
                        quantity: true,
                        scrapPercentage: true,
                        productVariant: {
                            select: {
                                standardCost: true,
                                buyPrice: true,
                                price: true,
                            },
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

    return { unitCost, journalTotal };
}

export async function recordFinishedGoodsOutput(params: {
    tx: Prisma.TransactionClient;
    productionOrderId: string;
    order: ProductionExecutionOrder;
    quantityProduced: number;
    materialRoundingAdjustment?: number;
    reference: string;
}) {
    const { tx, productionOrderId, order, quantityProduced, reference } =
        params;
    if (quantityProduced <= 0) {
        return;
    }

    const locationId = order.locationId;
    const outputVariantId = order.bom.productVariantId;

    // ── Cost Resolution ────────────────────────────────────────────────
    // Company output takes this WO's remaining posted WIP, the same source the
    // WIP guard funds it from. It never falls back to a master or sale price.
    const { unitCost, journalTotal } = order.isMaklon
        ? await resolveMaklonOutputCost({
              tx, productionOrderId, outputVariantId, quantityProduced,
              materialRoundingAdjustment: params.materialRoundingAdjustment,
          })
        : await ProductionCostService.calculateRemainingOutputValuation(
              productionOrderId, quantityProduced, tx,
          );

    // ── Inventory Posting ──────────────────────────────────────────────
    // Always use incrementStockWithCost so averageCost is recalculated,
    // even when unitCost is 0 (avoids stale avgCost from old stock opname).
    await InventoryCoreService.incrementStockWithCost(
        tx,
        locationId,
        outputVariantId,
        quantityProduced,
        unitCost,
    );

    let reservationId: string | undefined;

    // Hook auto-reserve for SalesOrder if linked (Fase A)
    if (order.salesOrderId && isSalesStockReservationEnabled()) {
        const salesOrder = await tx.salesOrder.findUnique({
            where: { id: order.salesOrderId },
            select: { expectedDate: true },
        });
        const residualDemand = await getSalesOrderResidualDemand(
            order.salesOrderId,
            outputVariantId,
            tx,
        );
        const reserveQty = Math.min(quantityProduced, residualDemand);

        if (reserveQty > 0) {
            const reservation = await createStockReservation(
                {
                    productVariantId: outputVariantId,
                    locationId,
                    quantity: reserveQty,
                    reservedFor: ReservationType.SALES_ORDER,
                    referenceId: order.salesOrderId,
                    reservedUntil: salesOrder?.expectedDate ?? undefined,
                },
                tx,
            );
            reservationId = reservation.id;
        }
    }

    const movement = await tx.stockMovement.create({
        data: {
            type: MovementType.IN,
            productVariantId: outputVariantId,
            toLocationId: locationId,
            quantity: quantityProduced,
            cost: unitCost,
            reference: reservationId
                ? `${reference} | RESERVE:${reservationId}`
                : reference,
            productionOrderId,
        },
    });
    // The linked journal persists the exact money amount; 4dp unit cost cannot
    // reconstruct it. Replay and reversal use that original journal, not a new COGM.
    await AccountingService.recordInventoryMovement(movement, tx, {
        productionOutput: true, ...(journalTotal === undefined ? {} : { journalTotal }),
    });
}

/**
 * @deprecated DELEGATED: Inventory/Production journal entries are recorded as a single source of truth
 * directly under the Prisma transaction in `recordFinishedGoodsOutput` using `AccountingService.recordInventoryMovement`.
 * This method is now a no-op to prevent duplicate posting risks.
 */
export async function triggerProductionOutputJournal(
    _executionId: string,
    _quantityProduced: number,
) {
    // No-op: delegated to AccountingService.recordInventoryMovement inside transaction.
    return;
}
