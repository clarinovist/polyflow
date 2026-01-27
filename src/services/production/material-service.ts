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

    static async batchIssueMaterials(data: BatchMaterialIssueValues & { userId?: string }) {
        const {
            productionOrderId,
            locationId,
            items,
            removedPlannedMaterialIds,
            addedPlannedMaterials,
            requestId
        } = data;
        const userId = data.userId;

        const issueIds: string[] = [];

        await prisma.$transaction(async (tx) => {
            // 1. Idempotency Check
            if (requestId) {
                const existing = await tx.stockMovement.findFirst({
                    where: { reference: { contains: `REQ:${requestId}` } }
                });
                if (existing) {
                    console.log(`Idempotency: Request ${requestId} already processed. Skipping.`);
                    return;
                }
            }

            const order = await tx.productionOrder.findUniqueOrThrow({
                where: { id: productionOrderId },
                include: {
                    materialIssues: true,
                    plannedMaterials: {
                        include: { productVariant: true }
                    }
                }
            });

            // Handle plan changes (remove/add)
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

            // Standardize Prefix
            const refPrefix = `PROD-ISSUE-${order.orderNumber}`;
            const idempotencySuffix = requestId ? ` REQ:${requestId}` : "";

            for (const item of items) {
                // 2. Server-side Capping
                const planItem = order.plannedMaterials.find(p => p.productVariantId === item.productVariantId);
                const plannedQty = planItem ? Number(planItem.quantity) : 0;
                const issuedSoFar = order.materialIssues
                    .filter(mi => mi.productVariantId === item.productVariantId)
                    .reduce((sum, mi) => sum + Number(mi.quantity), 0);

                const remaining = Math.max(0, plannedQty - issuedSoFar);

                let quantityToIssue = item.quantity;
                if (plannedQty > 0 && quantityToIssue > remaining) {
                    console.warn(`Capping issue for ${item.productVariantId}: requested ${quantityToIssue}, available ${remaining}`);
                    quantityToIssue = remaining;
                }

                if (quantityToIssue <= 0) continue;

                // 3. Auto-FIFO logic
                let remainingToDeduct = quantityToIssue;

                if (!item.batchId) {
                    // Find available batches for this variant in this location
                    const batches = await tx.batch.findMany({
                        where: {
                            productVariantId: item.productVariantId,
                            locationId,
                            quantity: { gt: 0 }
                        },
                        orderBy: { manufacturingDate: 'asc' } // FIFO
                    });

                    if (batches.length === 0) {
                        // Fallback: Check if there's stock without batch record
                        await InventoryService.validateAndLockStock(tx, locationId, item.productVariantId, remainingToDeduct);
                        await InventoryService.deductStock(tx, locationId, item.productVariantId, remainingToDeduct);

                        const newIssue = await tx.materialIssue.create({
                            data: {
                                productionOrderId,
                                productVariantId: item.productVariantId,
                                quantity: remainingToDeduct,
                                locationId, // SAVED: Direct location tracking
                                createdById: userId
                            }
                        });
                        issueIds.push(newIssue.id);

                        await tx.stockMovement.create({
                            data: {
                                type: MovementType.OUT,
                                productVariantId: item.productVariantId,
                                fromLocationId: locationId,
                                toLocationId: null,
                                quantity: remainingToDeduct,
                                reference: `${refPrefix}${idempotencySuffix}`,
                                createdById: userId
                            } // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        } as any);
                    } else {
                        for (const batch of batches) {
                            if (remainingToDeduct <= 0) break;

                            const deductFromBatch = Math.min(Number(batch.quantity), remainingToDeduct);

                            // Deduct from Batch table
                            await tx.batch.update({
                                where: { id: batch.id },
                                data: { quantity: { decrement: deductFromBatch } }
                            });

                            // Deduct from Inventory
                            await tx.inventory.update({
                                where: { locationId_productVariantId: { locationId, productVariantId: item.productVariantId } },
                                data: { quantity: { decrement: deductFromBatch } }
                            });

                            const newIssue = await tx.materialIssue.create({
                                data: {
                                    productionOrderId,
                                    productVariantId: item.productVariantId,
                                    quantity: deductFromBatch,
                                    batchId: batch.id,
                                    locationId, // SAVED: Direct location tracking
                                    createdById: userId
                                }
                            });
                            issueIds.push(newIssue.id);

                            await tx.stockMovement.create({
                                data: {
                                    type: MovementType.OUT,
                                    productVariantId: item.productVariantId,
                                    fromLocationId: locationId,
                                    toLocationId: null,
                                    quantity: deductFromBatch,
                                    reference: `${refPrefix}${idempotencySuffix}`,
                                    batchId: batch.id,
                                    createdById: userId
                                } // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            } as any);

                            remainingToDeduct -= deductFromBatch;
                        }

                        if (remainingToDeduct > 0.0001) {
                            throw new Error(`Insufficient stock in batches for ${item.productVariantId}. Missing: ${remainingToDeduct}`);
                        }
                    }
                } else {
                    // Manual batchId selected
                    const batch = await tx.batch.findUnique({ where: { id: item.batchId } });
                    if (!batch || Number(batch.quantity) < remainingToDeduct) {
                        throw new Error(`Selected batch ${batch?.batchNumber || item.batchId} has insufficient stock or not found.`);
                    }

                    await tx.batch.update({
                        where: { id: item.batchId },
                        data: { quantity: { decrement: remainingToDeduct } }
                    });

                    await tx.inventory.update({
                        where: { locationId_productVariantId: { locationId, productVariantId: item.productVariantId } },
                        data: { quantity: { decrement: remainingToDeduct } }
                    });

                    const newIssue = await tx.materialIssue.create({
                        data: {
                            productionOrderId,
                            productVariantId: item.productVariantId,
                            quantity: remainingToDeduct,
                            batchId: item.batchId,
                            locationId, // SAVED: Direct location tracking
                            createdById: userId
                        }
                    });
                    issueIds.push(newIssue.id);

                    await tx.stockMovement.create({
                        data: {
                            type: MovementType.OUT,
                            productVariantId: item.productVariantId,
                            fromLocationId: locationId,
                            toLocationId: null,
                            quantity: remainingToDeduct,
                            reference: `${refPrefix}${idempotencySuffix}`,
                            batchId: item.batchId,
                            createdById: userId
                        } // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    } as any);
                }
            }
        });

        for (const id of issueIds) {
            await AutoJournalService.handleMaterialIssue(id);
        }
    }

    static async recordMaterialIssue(data: MaterialIssueValues & { userId?: string }) {
        const { productionOrderId, productVariantId, locationId, quantity, userId, batchId } = data;
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
                    reference: `Production Consumption: ${order?.orderNumber || 'UNKNOWN'}`,
                    createdById: userId,
                    batchId: batchId
                }
            });

            const issue = await tx.materialIssue.create({
                data: {
                    productionOrderId,
                    productVariantId,
                    quantity,
                    createdById: userId,
                    batchId,
                    locationId // SAVED: Direct location tracking
                }
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

            // ROBUST: Use saved locationId or fallback to rm_warehouse slug only if record is old (NULL locationId)
            let refundLocationId = issue.locationId;
            if (!refundLocationId) {
                const legacyLoc = await tx.location.findUnique({ where: { slug: 'rm_warehouse' } }); // CORRECTED SLUG
                if (!legacyLoc) throw new Error("Could not determine refund location (rm_warehouse slug not found)");
                refundLocationId = legacyLoc.id;
            }

            await InventoryService.incrementStock(
                tx,
                refundLocationId,
                issue.productVariantId,
                issue.quantity.toNumber()
            );

            // Re-increment batch if it existed
            if (issue.batchId) {
                await tx.batch.update({
                    where: { id: issue.batchId },
                    data: { quantity: { increment: issue.quantity } }
                });
            }

            // Fetch orderNumber for tracking
            const order = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { orderNumber: true }
            });

            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: issue.productVariantId,
                    toLocationId: refundLocationId,
                    quantity: issue.quantity,
                    reference: `VOID Issue: ${order?.orderNumber || 'UNKNOWN'}`,
                    batchId: issue.batchId
                }
            });

            await tx.materialIssue.delete({ where: { id: issueId } });
        });
    }

    // --- Scrap ---

    static async recordScrap(data: ScrapRecordValues & { userId?: string }) {
        const { productionOrderId, productVariantId, locationId, quantity, reason, userId } = data;
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
                    reference: `Production Scrap: ${order?.orderNumber || 'UNKNOWN'}`,
                    createdById: userId
                }
            });

            const scrap = await tx.scrapRecord.create({
                data: { productionOrderId, productVariantId, quantity, reason, createdById: userId, locationId }
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

            // ROBUST: Use saved locationId
            let locationId = scrap.locationId;
            if (!locationId) {
                // Legacy fallback: determine from StockMovement
                const movement = await tx.stockMovement.findFirst({
                    where: {
                        productVariantId: scrap.productVariantId,
                        reference: { contains: `${productionOrderId}` },
                        type: MovementType.IN,
                        quantity: scrap.quantity
                    },
                    orderBy: { createdAt: 'desc' }
                });
                locationId = movement?.toLocationId ?? null;
            }

            if (!locationId) {
                const scrapLoc = await tx.location.findUnique({ where: { slug: 'scrap_warehouse' } });
                if (!scrapLoc) throw new Error("Could not determine location to reverse scrap from.");
                locationId = scrapLoc.id;
            }

            await InventoryService.deductStock(tx, locationId, scrap.productVariantId, scrap.quantity.toNumber());

            const order = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { orderNumber: true }
            });

            await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId: scrap.productVariantId,
                    fromLocationId: locationId,
                    quantity: scrap.quantity,
                    reference: `VOID Scrap: ${order?.orderNumber || 'UNKNOWN'}`
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
                await tx.journalEntry.update({
                    where: { id: journal.id },
                    data: { status: 'VOIDED' }
                });
            }
        });
    }

    // --- Quality ---

    static async recordQualityInspection(data: QualityInspectionValues & { userId?: string }) {
        const { productionOrderId, result, notes, userId } = data;

        await prisma.qualityInspection.create({
            data: {
                productionOrderId,
                result,
                notes,
                inspectorId: userId || 'SYSTEM',
                inspectedAt: new Date()
            }
        });
    }
}
