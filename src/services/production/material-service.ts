import { prisma } from '@/lib/prisma';
import {
    BatchMaterialIssueValues,
    MaterialIssueValues,
    ScrapRecordValues,
    QualityInspectionValues
} from '@/lib/schemas/production';
import { MovementType } from '@prisma/client';
import { InventoryService } from '../inventory-service'; // Relative import adjusted

export class ProductionMaterialService {

    // --- Material Issues ---

    static async batchIssueMaterials(data: BatchMaterialIssueValues) {
        const {
            productionOrderId,
            locationId,
            items,
            removedPlannedMaterialIds,
            addedPlannedMaterials
        } = data;

        await prisma.$transaction(async (tx) => {
            const order = await tx.productionOrder.findUniqueOrThrow({
                where: { id: productionOrderId },
                include: {
                    materialIssues: true,
                    plannedMaterials: {
                        include: { productVariant: true }
                    }
                }
            });

            if (removedPlannedMaterialIds && removedPlannedMaterialIds.length > 0) {
                for (const id of removedPlannedMaterialIds) {
                    const planItem = order.plannedMaterials.find(pm => pm.id === id);
                    if (planItem) {
                        const issued = order.materialIssues
                            .filter(mi => mi.productVariantId === planItem.productVariantId)
                            .reduce((sum: number, mi) => sum + Number(mi.quantity), 0);

                        if (issued > 0.001) {
                            throw new Error(`Cannot remove ${planItem.productVariant.name} because it has already been partially issued.`);
                        }
                        await tx.productionMaterial.delete({ where: { id } });
                    }
                }
            }

            if (addedPlannedMaterials && addedPlannedMaterials.length > 0) {
                for (const newItem of addedPlannedMaterials) {
                    await tx.productionMaterial.create({
                        data: {
                            productionOrderId,
                            productVariantId: newItem.productVariantId,
                            quantity: newItem.quantity
                        }
                    });
                }
            }

            for (const item of items) {
                // Lock & Check
                await InventoryService.validateAndLockStock(
                    tx,
                    locationId,
                    item.productVariantId,
                    item.quantity
                );

                // Deduct
                await InventoryService.deductStock(
                    tx,
                    locationId,
                    item.productVariantId,
                    item.quantity
                );

                await tx.materialIssue.create({
                    data: {
                        productionOrderId,
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        batchId: item.batchId
                    } // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any);

                await tx.stockMovement.create({
                    data: {
                        type: MovementType.OUT,
                        productVariantId: item.productVariantId,
                        fromLocationId: locationId,
                        toLocationId: null,
                        quantity: item.quantity,
                        reference: `PROD-ISSUE-PO-${order.orderNumber}`,
                        batchId: item.batchId
                    } // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any);
            }
        });
    }

    static async recordMaterialIssue(data: MaterialIssueValues) {
        const { productionOrderId, productVariantId, locationId, quantity } = data;

        await prisma.$transaction(async (tx) => {
            await InventoryService.validateAndLockStock(
                tx,
                locationId,
                productVariantId,
                quantity
            );

            await InventoryService.deductStock(
                tx,
                locationId,
                productVariantId,
                quantity
            );

            // Fetch current cost for COGM tracking
            const inv = await tx.inventory.findUnique({
                where: { locationId_productVariantId: { locationId, productVariantId } }
            });
            const wacCost = inv?.averageCost?.toNumber() || 0;

            // Fetch orderNumber for tracking
            const order = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { orderNumber: true }
            });

            await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId,
                    fromLocationId: locationId,
                    quantity,
                    cost: wacCost,
                    reference: `Production Consumption: PO-${order?.orderNumber || 'UNKNOWN'}`
                }
            });

            await tx.materialIssue.create({
                data: { productionOrderId, productVariantId, quantity }
            });
        });
    }

    static async deleteMaterialIssue(issueId: string, productionOrderId: string) {
        await prisma.$transaction(async (tx) => {
            const issue = await tx.materialIssue.findUnique({
                where: { id: issueId }
            });
            if (!issue) throw new Error("Material Issue record not found");

            const refundLocation = await tx.location.findUnique({
                where: { slug: 'raw_material_warehouse' }
            });
            if (!refundLocation) throw new Error("Could not determine refund location (Raw Material Warehouse not found)");

            await InventoryService.incrementStock(
                tx,
                refundLocation.id,
                issue.productVariantId,
                issue.quantity.toNumber()
            );

            // Fetch orderNumber for tracking
            const order = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { orderNumber: true }
            });

            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: issue.productVariantId,
                    toLocationId: refundLocation.id,
                    quantity: issue.quantity,
                    reference: `VOID Issue: PO-${order?.orderNumber || 'UNKNOWN'}`
                }
            });

            await tx.materialIssue.delete({ where: { id: issueId } });
        });
    }

    // --- Scrap ---

    static async recordScrap(data: ScrapRecordValues) {
        const { productionOrderId, productVariantId, locationId, quantity, reason } = data;

        await prisma.$transaction(async (tx) => {
            await InventoryService.incrementStock(
                tx,
                locationId,
                productVariantId,
                quantity
            );

            // Fetch orderNumber for tracking
            const order = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { orderNumber: true }
            });

            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId,
                    toLocationId: locationId,
                    quantity,
                    reference: `Production Scrap: PO-${order?.orderNumber || 'UNKNOWN'}`
                }
            });

            await tx.scrapRecord.create({
                data: { productionOrderId, productVariantId, quantity, reason }
            });
        });
    }

    // --- Quality ---

    static async recordQualityInspection(data: QualityInspectionValues) {
        const { productionOrderId, result, notes } = data;

        await prisma.qualityInspection.create({
            data: {
                productionOrderId,
                result,
                notes,
                inspectorId: 'SYSTEM', // Placeholder or need user context
                inspectedAt: new Date()
            }
        });
    }
}
