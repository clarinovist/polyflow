import { MovementType, Prisma } from '@prisma/client';

import { AccountingService } from '@/services/accounting/accounting-service';
import { InventoryCoreService } from '@/services/inventory/core-service';

import { resolveMaterialLocation } from './execution-material-location';
import type { MaterialLike, OutputBackflushContext, ProductionExecutionOrder } from './execution-types';

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

function hasFloorEnteredBalRule(attributes: unknown): boolean {
    return !!attributes &&
        typeof attributes === 'object' &&
        !Array.isArray(attributes) &&
        (attributes as Record<string, unknown>).consumptionRule === 'FLOOR_ENTERED_BAL';
}

export function isWholeBalPackagingMaterial(item: MaterialLike): boolean {
    const productType = item.productVariant?.product?.productType;
    const primaryUnit = item.productVariant?.primaryUnit;
    const attributes = item.productVariant?.attributes;
    const materialName = item.productVariant?.name?.toLowerCase() || '';
    const skuCode = item.productVariant?.skuCode?.toLowerCase() || '';
    const isKarungLike = materialName.includes('karung') || skuCode.includes('kar');

    if (hasFloorEnteredBalRule(attributes)) {
        return true;
    }

    return primaryUnit === 'PACK' &&
        isKarungLike &&
        (productType === 'PACKAGING' || productType === 'RAW_MATERIAL' || !productType);
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

    if (
        order.bom?.category === 'PACKING' &&
        outputContext?.enteredUnit === 'BAL' &&
        typeof enteredQuantity === 'number' &&
        Number.isFinite(enteredQuantity) &&
        isWholeBalPackagingMaterial(item)
    ) {
        return Math.floor(enteredQuantity);
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

        // Check if this material has already been manually issued by the warehouse team (Fase C guard)
        const manualIssueMovement = await tx.stockMovement.findFirst({
            where: {
                productionOrderId,
                productVariantId: item.productVariantId,
                type: MovementType.OUT,
                reference: {
                    startsWith: 'PROD-ISSUE-',
                },
            },
        });

        const consolIssueMovement = await tx.stockMovement.findFirst({
            where: {
                productionOrderId,
                productVariantId: item.productVariantId,
                type: MovementType.OUT,
                reference: {
                    startsWith: 'PROD-CONSOL-',
                },
            },
        });

        if (manualIssueMovement || consolIssueMovement) {
            console.log(`Guard: Skipping backflush for ${item.productVariantId} on PO ${productionOrderId} because it was manually issued.`);
            continue;
        }

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

        // Convert warehouse STAGED (transfer ke WIP) into ISSUED for actual consumption,
        // so progress stays correct (STAGED+ISSUED) and HPP only counts ISSUED.
        let remainingToConvert = qtyToDeduct;
        const stagedIssues = await tx.materialIssue.findMany({
            where: {
                productionOrderId,
                productVariantId: item.productVariantId,
                status: 'STAGED',
            },
            orderBy: { issuedAt: 'asc' },
        });

        for (const staged of stagedIssues) {
            if (remainingToConvert <= 0.0001) break;
            const stagedQty = Number(staged.quantity);
            if (stagedQty <= 0.0001) continue;

            if (stagedQty <= remainingToConvert + 0.0001) {
                await tx.materialIssue.update({
                    where: { id: staged.id },
                    data: {
                        status: 'ISSUED',
                        locationId: consumptionLocationId,
                    },
                });
                remainingToConvert -= stagedQty;
            } else {
                // Partial consume: shrink STAGED, create ISSUED for consumed slice
                await tx.materialIssue.update({
                    where: { id: staged.id },
                    data: { quantity: stagedQty - remainingToConvert },
                });
                await tx.materialIssue.create({
                    data: {
                        productionOrderId,
                        productVariantId: item.productVariantId,
                        quantity: remainingToConvert,
                        locationId: consumptionLocationId,
                        status: 'ISSUED',
                        createdById: userId,
                    },
                });
                remainingToConvert = 0;
            }
        }

        // Pure backflush (no prior staging) or over-consumption beyond staged qty
        if (remainingToConvert > 0.0001) {
            await tx.materialIssue.create({
                data: {
                    productionOrderId,
                    productVariantId: item.productVariantId,
                    quantity: remainingToConvert,
                    locationId: consumptionLocationId,
                    status: 'ISSUED',
                    createdById: userId,
                },
            });
        }
    }
}
