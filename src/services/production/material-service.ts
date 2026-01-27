import { prisma } from '@/lib/prisma';
import {
    BatchMaterialIssueValues,
    MaterialIssueValues,
    ScrapRecordValues,
    QualityInspectionValues
} from '@/lib/schemas/production';
import { MovementType, ReferenceType } from '@prisma/client';
import { InventoryService } from '../inventory-service';
import { AutoJournalService } from '../finance/auto-journal-service';
import { AccountingService } from '../accounting-service';

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

        const issueIds: string[] = [];

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

                const newIssue = await tx.materialIssue.create({
                    data: {
                        productionOrderId,
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        batchId: item.batchId
                    }
                });
                issueIds.push(newIssue.id);

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

        for (const id of issueIds) {
            await AutoJournalService.handleMaterialIssue(id);
        }
    }

    static async recordMaterialIssue(data: MaterialIssueValues) {
        const { productionOrderId, productVariantId, locationId, quantity } = data;
        let issueId = '';

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

            const issue = await tx.materialIssue.create({
                data: { productionOrderId, productVariantId, quantity }
            });
            issueId = issue.id;
        });

        if (issueId) {
            await AutoJournalService.handleMaterialIssue(issueId);
        }
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
        let scrapId = '';

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

            const scrap = await tx.scrapRecord.create({
                data: { productionOrderId, productVariantId, quantity, reason }
            });
            scrapId = scrap.id;
        });

        if (scrapId) {
            await AutoJournalService.handleScrapOutput(scrapId);
        }
    }

    static async deleteScrap(scrapId: string, productionOrderId: string) {
        await prisma.$transaction(async (tx) => {
            const scrap = await tx.scrapRecord.findUnique({
                where: { id: scrapId },
                include: { productVariant: true }
            });

            if (!scrap) throw new Error("Scrap record not found");

            // We need to determine the location where it was scrapped.
            // Since ScrapRecord doesn't store location (which is a bug/limitation in current schema),
            // we should find the corresponding StockMovement to know where to deduct from.
            const movement = await tx.stockMovement.findFirst({
                where: {
                    productVariantId: scrap.productVariantId,
                    reference: { contains: `PO-` }, // Basic filter
                    type: MovementType.IN,
                    quantity: scrap.quantity
                },
                orderBy: { createdAt: 'desc' }
            });

            const locationId = movement?.toLocationId;
            if (!locationId) {
                // Fallback to scrap warehouse if possible
                const scrapLoc = await tx.location.findUnique({ where: { slug: 'scrap_warehouse' } });
                if (!scrapLoc) throw new Error("Could not determine location to reverse scrap from.");

                await InventoryService.deductStock(tx, scrapLoc.id, scrap.productVariantId, scrap.quantity.toNumber());
            } else {
                await InventoryService.deductStock(tx, locationId, scrap.productVariantId, scrap.quantity.toNumber());
            }

            const order = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { orderNumber: true }
            });

            await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId: scrap.productVariantId,
                    fromLocationId: locationId || 'UNKNOWN',
                    quantity: scrap.quantity,
                    reference: `VOID Scrap: PO-${order?.orderNumber || 'UNKNOWN'}`
                } // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);

            // Delete record
            await tx.scrapRecord.delete({ where: { id: scrapId } });

            // Find and Void Journal Entry
            const journal = await tx.journalEntry.findFirst({
                where: {
                    referenceType: ReferenceType.STOCK_ADJUSTMENT,
                    referenceId: scrapId
                }
            });

            if (journal && journal.status === 'POSTED') {
                await AccountingService.voidJournal(journal.id);
            } else if (journal && journal.status === 'DRAFT') {
                // If it's still a draft, we can just delete it or void it. Voiding is safer for audit trails.
                await tx.journalEntry.update({
                    where: { id: journal.id },
                    data: { status: 'VOIDED' }
                });
            }
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
