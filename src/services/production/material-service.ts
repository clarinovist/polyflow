import { prisma } from '@/lib/core/prisma';
import {
    BatchMaterialIssueValues,
    ConsolidatedBatchMaterialIssueValues,
    MaterialIssueValues,
    AdHocMaterialUsageValues,
    ScrapRecordValues,
    QualityInspectionValues
} from '@/lib/schemas/production';
import { MovementType, ReferenceType, Prisma } from '@prisma/client';
import { InventoryCoreService } from '@/services/inventory/core-service';
// import { AutoJournalService } from '../finance/auto-journal-service';
import { AccountingService } from '../accounting/accounting-service';
import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';
import { ValidationError, NotFoundError, InsufficientStockError, ProductionRuleViolationError } from '@/lib/errors/errors';

export class ProductionMaterialService {

    private static async getIssueUnitCost(
        tx: Prisma.TransactionClient,
        locationId: string,
        productVariantId: string
    ): Promise<number> {
        const inventory = await tx.inventory.findUnique({
            where: {
                locationId_productVariantId: { locationId, productVariantId }
            },
            select: {
                averageCost: true,
                productVariant: {
                    select: {
                        standardCost: true,
                        buyPrice: true,
                        price: true
                    }
                }
            }
        });

        if (inventory?.averageCost !== null && inventory?.averageCost !== undefined) {
            return inventory.averageCost.toNumber();
        }

        return Number(
            inventory?.productVariant?.standardCost ??
            inventory?.productVariant?.buyPrice ??
            inventory?.productVariant?.price ??
            0
        );
    }

    // --- Material Issues ---

    static async batchIssueMaterials(data: BatchMaterialIssueValues & { userId?: string }) {
        const {
            productionOrderId,
            locationId,
            items,
            removedPlannedMaterialIds,
            addedPlannedMaterials,
            requestId,
            recordAsStaged = false,
        } = data;
        const userId = data.userId;

        const issueIds: string[] = [];

        await prisma.$transaction(async (tx) => {
            // 1. Idempotency Check (issue path creates PROD-ISSUE movements with REQ:)
            if (requestId && !recordAsStaged) {
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
                const idsToDelete: string[] = [];
                for (const id of removedPlannedMaterialIds) {
                    const planItem = order.plannedMaterials.find(pm => pm.id === id);
                    if (planItem) {
                        const issued = order.materialIssues
                            .filter(mi => mi.productVariantId === planItem.productVariantId && mi.status !== 'VOIDED')
                            .reduce((sum: number, mi) => sum + Number(mi.quantity), 0);

                        if (issued > 0.001) {
                            throw new ProductionRuleViolationError(`Tidak dapat menghapus ${planItem.productVariant.name} karena sudah sebagian di-issue.`);
                        }
                        idsToDelete.push(id);
                    }
                }

                if (idsToDelete.length > 0) {
                    await tx.productionMaterial.deleteMany({
                        where: { id: { in: idsToDelete } }
                    });
                }
            }

        if (addedPlannedMaterials && addedPlannedMaterials.length > 0) {
            for (const newItem of addedPlannedMaterials) {
                const existing = order.plannedMaterials.find(
                    pm => pm.productVariantId === newItem.productVariantId
                        && !(removedPlannedMaterialIds || []).includes(pm.id)
                );
                
                if (existing) {
                    await tx.productionMaterial.update({
                        where: { id: existing.id },
                        data: { quantity: newItem.quantity }
                    });
                } else {
                    await tx.productionMaterial.create({
                        data: {
                            productionOrderId,
                            productVariantId: newItem.productVariantId,
                            quantity: newItem.quantity
                        }
                    });
                }
            }
        }

            // Staging path: stock already moved via transferStockBulk — only record MaterialIssue
            // so warehouse "Issued" progress updates without double stock OUT / premature HPP.
            if (recordAsStaged) {
                for (const item of items) {
                    const stagingLocationId = item.sourceLocationId || locationId;
                    if (!stagingLocationId) throw new ValidationError("Lokasi staging wajib diisi");

                    const planItem = order.plannedMaterials.find(p => p.productVariantId === item.productVariantId);
                    const plannedQty = planItem ? Number(planItem.quantity) : 0;
                    const issuedSoFar = order.materialIssues
                        .filter(mi => mi.productVariantId === item.productVariantId && mi.status !== 'VOIDED')
                        .reduce((sum, mi) => sum + Number(mi.quantity), 0);

                    const remaining = Math.max(0, plannedQty - issuedSoFar);
                    let quantityToStage = item.quantity;
                    if (plannedQty > 0 && quantityToStage > remaining) {
                        console.warn(`Capping stage for ${item.productVariantId}: requested ${quantityToStage}, available ${remaining}`);
                        quantityToStage = remaining;
                    }
                    if (quantityToStage <= 0) continue;

                    const newIssue = await tx.materialIssue.create({
                        data: {
                            productionOrderId,
                            productVariantId: item.productVariantId,
                            quantity: quantityToStage,
                            locationId: stagingLocationId,
                            status: 'STAGED',
                            createdById: userId,
                        }
                    });
                    issueIds.push(newIssue.id);
                    // Keep in-memory totals accurate for multi-line cap within same batch
                    order.materialIssues.push(newIssue as (typeof order.materialIssues)[number]);
                }
                return;
            }

            // Standardize Prefix
            const refPrefix = `PROD-ISSUE-${order.orderNumber}`;
            const idempotencySuffix = requestId ? ` REQ:${requestId}` : "";

            for (const item of items) {
                const itemLocationId = item.sourceLocationId || locationId;
                if (!itemLocationId) throw new ValidationError("Lokasi sumber wajib diisi");
                // 2. Server-side Capping
                const planItem = order.plannedMaterials.find(p => p.productVariantId === item.productVariantId);
                const plannedQty = planItem ? Number(planItem.quantity) : 0;
                const issuedSoFar = order.materialIssues
                    .filter(mi => mi.productVariantId === item.productVariantId && mi.status !== 'VOIDED')
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
                            locationId: itemLocationId,
                            quantity: { gt: 0 }
                        },
                        orderBy: { manufacturingDate: 'asc' } // FIFO
                    });

                    if (batches.length === 0) {
                        // Fallback: Check if there's stock without batch record
                        const unitCost = await this.getIssueUnitCost(tx, itemLocationId, item.productVariantId);
                        await InventoryCoreService.validateAndLockStock(tx, itemLocationId, item.productVariantId, remainingToDeduct);
                        await InventoryCoreService.deductStock(tx, itemLocationId, item.productVariantId, remainingToDeduct);

                        const newIssue = await tx.materialIssue.create({
                            data: {
                                productionOrderId,
                                productVariantId: item.productVariantId,
                                quantity: remainingToDeduct,
                                locationId: itemLocationId, // SAVED: Direct location tracking
                                createdById: userId
                            }
                        });
                        issueIds.push(newIssue.id);

                        const moveOut = await tx.stockMovement.create({
                            data: {
                                type: MovementType.OUT,
                                productVariantId: item.productVariantId,
                                fromLocationId: itemLocationId,
                                toLocationId: null,
                                quantity: remainingToDeduct,
                                cost: unitCost,
                                reference: `${refPrefix}${idempotencySuffix}`,
                                createdById: userId,
                                productionOrderId: productionOrderId // Add structured relation
                            }
                        });
                        await AccountingService.recordInventoryMovement(moveOut, tx);
                    } else {
                        const unitCost = await this.getIssueUnitCost(tx, itemLocationId, item.productVariantId);
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
                                where: { locationId_productVariantId: { locationId: itemLocationId, productVariantId: item.productVariantId } },
                                data: { quantity: { decrement: deductFromBatch } }
                            });

                            const newIssue = await tx.materialIssue.create({
                                data: {
                                    productionOrderId,
                                    productVariantId: item.productVariantId,
                                    quantity: deductFromBatch,
                                    batchId: batch.id,
                                    locationId: itemLocationId, // SAVED: Direct location tracking
                                    createdById: userId
                                }
                            });
                            issueIds.push(newIssue.id);

                            const moveOut = await tx.stockMovement.create({
                                data: {
                                    type: MovementType.OUT,
                                    productVariantId: item.productVariantId,
                                    fromLocationId: itemLocationId,
                                    toLocationId: null,
                                    quantity: deductFromBatch,
                                    cost: unitCost,
                                    reference: `${refPrefix}${idempotencySuffix}`,
                                    batchId: batch.id,
                                    createdById: userId,
                                    productionOrderId: productionOrderId // Add structured relation
                                }
                            });
                            await AccountingService.recordInventoryMovement(moveOut, tx);

                            remainingToDeduct -= deductFromBatch;
                        }

                        if (remainingToDeduct > 0.0001) {
                            throw new InsufficientStockError(`Stok batch tidak mencukupi. Kurang: ${remainingToDeduct}`);
                        }
                    }
                } else {
                    // Manual batchId selected
                    const unitCost = await this.getIssueUnitCost(tx, itemLocationId, item.productVariantId);
                    const batch = await tx.batch.findUnique({ where: { id: item.batchId } });
                    if (!batch || Number(batch.quantity) < remainingToDeduct) {
                        throw new InsufficientStockError(`Batch ${batch?.batchNumber || item.batchId} stoknya tidak mencukupi atau tidak ditemukan.`);
                    }

                    await tx.batch.update({
                        where: { id: item.batchId },
                        data: { quantity: { decrement: remainingToDeduct } }
                    });

                    await tx.inventory.update({
                        where: { locationId_productVariantId: { locationId: itemLocationId, productVariantId: item.productVariantId } },
                        data: { quantity: { decrement: remainingToDeduct } }
                    });

                    const newIssue = await tx.materialIssue.create({
                        data: {
                            productionOrderId,
                            productVariantId: item.productVariantId,
                            quantity: remainingToDeduct,
                            batchId: item.batchId,
                            locationId: itemLocationId, // SAVED: Direct location tracking
                            createdById: userId
                        }
                    });
                    issueIds.push(newIssue.id);

                    const moveOut = await tx.stockMovement.create({
                        data: {
                            type: MovementType.OUT,
                            productVariantId: item.productVariantId,
                            fromLocationId: itemLocationId,
                            toLocationId: null,
                            quantity: remainingToDeduct,
                            cost: unitCost,
                            reference: `${refPrefix}${idempotencySuffix}`,
                            batchId: item.batchId,
                            createdById: userId,
                            productionOrderId: productionOrderId // Add structured relation
                        }
                    });
                    await AccountingService.recordInventoryMovement(moveOut, tx);
                }
            }
        });
    }

    static async consolidatedBatchIssueMaterials(data: ConsolidatedBatchMaterialIssueValues & { userId?: string }) {
        const {
            productionOrderIds,
            locationId,
            items,
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

            // 2. Fetch all Production Orders
            const orders = await tx.productionOrder.findMany({
                where: { id: { in: productionOrderIds } },
                include: {
                    materialIssues: true,
                    plannedMaterials: {
                        include: { productVariant: true }
                    }
                }
            });

            if (orders.length === 0) {
                throw new ValidationError("Tidak ada production order yang ditemukan dengan ID tersebut.");
            }

            const idempotencySuffix = requestId ? ` REQ:${requestId}` : "";

            // Helper for proportional split
            const splitQuantityProportionally = (
                totalQty: number,
                poList: { id: string; need: number; originalPlan: number }[]
            ) => {
                const totalNeed = poList.reduce((sum, o) => sum + o.need, 0);
                const shares: Record<string, number> = {};

                if (totalNeed <= 0) {
                    const totalPlan = poList.reduce((sum, o) => sum + o.originalPlan, 0);
                    if (totalPlan <= 0) {
                        const qtyPerOrder = Number((totalQty / poList.length).toFixed(4));
                        let sum = 0;
                        poList.forEach((o, i) => {
                            if (i === poList.length - 1) {
                                shares[o.id] = Number((totalQty - sum).toFixed(4));
                            } else {
                                shares[o.id] = qtyPerOrder;
                                sum += qtyPerOrder;
                            }
                        });
                        return shares;
                    }

                    let sum = 0;
                    poList.forEach((o, i) => {
                        if (i === poList.length - 1) {
                            shares[o.id] = Number((totalQty - sum).toFixed(4));
                        } else {
                            const share = Number((totalQty * (o.originalPlan / totalPlan)).toFixed(4));
                            shares[o.id] = share;
                            sum += share;
                        }
                    });
                    return shares;
                }

                let sum = 0;
                const sortedOrders = [...poList].sort((a, b) => a.need - b.need);

                sortedOrders.forEach((o, i) => {
                    if (i === sortedOrders.length - 1) {
                        shares[o.id] = Number((totalQty - sum).toFixed(4));
                    } else {
                        const share = Number((totalQty * (o.need / totalNeed)).toFixed(4));
                        shares[o.id] = share;
                        sum += share;
                    }
                });

                return shares;
            };

            // 3. Process each material
            for (const item of items) {
                // Calculate remaining plan needs per PO
                const poNeeds = orders.map(o => {
                    const planItem = o.plannedMaterials.find(pm => pm.productVariantId === item.productVariantId);
                    const plannedQty = planItem
                        ? (typeof planItem.quantity === 'object' && planItem.quantity && 'toNumber' in planItem.quantity
                            ? (planItem.quantity as { toNumber: () => number }).toNumber()
                            : Number(planItem.quantity))
                        : 0;
                    const issuedSoFar = o.materialIssues
                        .filter(mi => mi.productVariantId === item.productVariantId && mi.status !== 'VOIDED')
                        .reduce((sum: number, mi) => sum + (typeof mi.quantity === 'object' && mi.quantity && 'toNumber' in mi.quantity
                            ? (mi.quantity as { toNumber: () => number }).toNumber()
                            : Number(mi.quantity)), 0);
                    const need = Math.max(0, plannedQty - issuedSoFar);
                    return {
                        id: o.id,
                        need,
                        originalPlan: plannedQty
                    };
                });

                const splitShares = splitQuantityProportionally(item.quantity, poNeeds);

                // Convert shares to list of { poId, quantity }
                const poShares = Object.entries(splitShares)
                    .map(([poId, quantity]) => ({ poId, quantity }))
                    .filter(s => s.quantity > 0);

                if (poShares.length === 0) continue;

                // 4. FIFO batch deduction for total picking qty
                let remainingToDeduct = item.quantity;
                const deductedBatches: { batchId: string | null; quantity: number }[] = [];

                const batches = await tx.batch.findMany({
                    where: {
                        productVariantId: item.productVariantId,
                        locationId,
                        quantity: { gt: 0 }
                    },
                    orderBy: { manufacturingDate: 'asc' } // FIFO
                });

                // Validate and Lock Inventory Stock
                await InventoryCoreService.validateAndLockStock(tx, locationId, item.productVariantId, item.quantity);
                await InventoryCoreService.deductStock(tx, locationId, item.productVariantId, item.quantity);
                const unitCost = await this.getIssueUnitCost(tx, locationId, item.productVariantId);

                if (batches.length === 0) {
                    deductedBatches.push({ batchId: null, quantity: item.quantity });
                } else {
                    for (const batch of batches) {
                        if (remainingToDeduct <= 0) break;
                        const deductFromBatch = Math.min(Number(batch.quantity), remainingToDeduct);

                        await tx.batch.update({
                            where: { id: batch.id },
                            data: { quantity: { decrement: deductFromBatch } }
                        });

                        deductedBatches.push({ batchId: batch.id, quantity: deductFromBatch });
                        remainingToDeduct -= deductFromBatch;
                    }

                    if (remainingToDeduct > 0.0001) {
                        throw new InsufficientStockError(`Stok batch tidak mencukupi untuk varian ini. Kurang: ${remainingToDeduct}`);
                    }
                }

                // 5. Match deducted batches with PO shares and record MaterialIssue + StockMovement
                let batchIdx = 0;
                let poIdx = 0;

                // Deep copy so we can mutate safely inside greedy loop
                const tempBatches = deductedBatches.map(b => ({ ...b }));
                const tempPoShares = poShares.map(p => ({ ...p }));

                while (batchIdx < tempBatches.length && poIdx < tempPoShares.length) {
                    const currentBatch = tempBatches[batchIdx];
                    const currentPo = tempPoShares[poIdx];

                    const matchQty = Math.min(currentBatch.quantity, currentPo.quantity);
                    if (matchQty > 0.0001) {
                        const poOrder = orders.find(o => o.id === currentPo.poId)!;
                        const refPrefix = `PROD-CONSOL-ISSUE-${poOrder.orderNumber}`;

                        const newIssue = await tx.materialIssue.create({
                            data: {
                                productionOrderId: currentPo.poId,
                                productVariantId: item.productVariantId,
                                quantity: matchQty,
                                batchId: currentBatch.batchId || undefined,
                                locationId,
                                createdById: userId
                            }
                        });
                        issueIds.push(newIssue.id);

                        const moveOut = await tx.stockMovement.create({
                            data: {
                                type: MovementType.OUT,
                                productVariantId: item.productVariantId,
                                fromLocationId: locationId,
                                toLocationId: null,
                                quantity: matchQty,
                                cost: unitCost,
                                reference: `${refPrefix}${idempotencySuffix}`,
                                batchId: currentBatch.batchId || undefined,
                                createdById: userId,
                                productionOrderId: currentPo.poId
                            }
                        });
                        await AccountingService.recordInventoryMovement(moveOut, tx);
                    }

                    currentBatch.quantity -= matchQty;
                    currentPo.quantity -= matchQty;

                    if (currentBatch.quantity <= 0.0001) {
                        batchIdx++;
                    }
                    if (currentPo.quantity <= 0.0001) {
                        poIdx++;
                    }
                }
            }
        });

        return issueIds;
    }

    static async recordMaterialIssue(data: MaterialIssueValues & { userId?: string }) {
        const { productionOrderId, productVariantId, locationId, quantity, userId, batchId } = data;

        await prisma.$transaction(async (tx) => {
            await InventoryCoreService.validateAndLockStock(
                tx,
                locationId,
                productVariantId,
                quantity
            );

            await InventoryCoreService.deductStock(
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

            const movement = await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId,
                    fromLocationId: locationId,
                    quantity,
                    cost: wacCost,
                    reference: `PROD-ISSUE-${order?.orderNumber || 'UNKNOWN'}`,
                    createdById: userId,
                    batchId: batchId,
                    productionOrderId: productionOrderId // Add structured relation
                }
            });
            await AccountingService.recordInventoryMovement(movement, tx);

            await tx.materialIssue.create({
                data: {
                    productionOrderId,
                    productVariantId,
                    quantity,
                    createdById: userId,
                    batchId,
                    locationId // SAVED: Direct location tracking
                }
            });
        });

        // if (issueId) {
        //     await AutoJournalService.handleMaterialIssue(issueId);
        // }
    }

    /**
     * Record ad-hoc material usage mid-run.
     * Deducts stock from source location directly (no transfer to FG/staging).
     * Reference uses PROD-ISSUE- prefix so backflush guard skips this variant.
     * Auto-upserts ProductionMaterial for plan visibility.
     */
    static async recordAdHocMaterialUsage(data: AdHocMaterialUsageValues & { userId?: string }) {
        const { productionOrderId, productVariantId, locationId, quantity, userId, requestId } = data;

        let issueId: string = '';
        let idempotent = false;

        await prisma.$transaction(async (tx) => {
            // 1. Idempotency check
            if (requestId) {
                const existing = await tx.stockMovement.findFirst({
                    where: { reference: { contains: `REQ:${requestId}` } }
                });
                if (existing) {
                    console.log(`Idempotency: Ad-hoc request ${requestId} already processed. Skipping.`);
                    // Find the existing issue for this order+variant to return its ID
                    const existingIssue = await tx.materialIssue.findFirst({
                        where: { productionOrderId, productVariantId },
                        orderBy: { issuedAt: 'desc' },
                    });
                    issueId = existingIssue?.id || '';
                    idempotent = true;
                    return;
                }
            }

            // 2. Load order + validate status
            const order = await tx.productionOrder.findUniqueOrThrow({
                where: { id: productionOrderId },
                include: {
                    plannedMaterials: true,
                },
            });

            if (order.status !== 'RELEASED' && order.status !== 'IN_PROGRESS') {
                throw new ProductionRuleViolationError(
                    `Tidak bisa issue bahan ad-hoc ke order berstatus ${order.status}. Harus RELEASED atau IN_PROGRESS.`
                );
            }

            // 3. Read WAC before deduct (cost may change after deduction)
            const unitCost = await this.getIssueUnitCost(tx, locationId, productVariantId);

            // 4. Validate + deduct stock
            await InventoryCoreService.validateAndLockStock(tx, locationId, productVariantId, quantity);
            await InventoryCoreService.deductStock(tx, locationId, productVariantId, quantity);

            // 5. Create StockMovement OUT (clean reference — no free-text user input)
            const refSuffix = requestId ? ` REQ:${requestId}` : '';
            const movement = await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId,
                    fromLocationId: locationId,
                    toLocationId: null,
                    quantity,
                    cost: unitCost,
                    reference: `PROD-ISSUE-${order.orderNumber}${refSuffix}`,
                    createdById: userId,
                    productionOrderId,
                }
            });
            await AccountingService.recordInventoryMovement(movement, tx);

            // 6. Create MaterialIssue
            const newIssue = await tx.materialIssue.create({
                data: {
                    productionOrderId,
                    productVariantId,
                    quantity,
                    locationId,
                    createdById: userId,
                }
            });
            issueId = newIssue.id;

            // 7. Upsert ProductionMaterial for visibility
            const totalIssuedNonVoided = (
                await tx.materialIssue.findMany({
                    where: {
                        productionOrderId,
                        productVariantId,
                        status: { not: 'VOIDED' },
                    },
                    select: { quantity: true },
                })
            ).reduce((sum, mi) => sum + Number(mi.quantity), 0);

            const existingPlan = order.plannedMaterials.find(
                pm => pm.productVariantId === productVariantId
            );

            if (existingPlan) {
                const newPlanQty = Math.max(Number(existingPlan.quantity), totalIssuedNonVoided);
                await tx.productionMaterial.update({
                    where: { id: existingPlan.id },
                    data: { quantity: newPlanQty },
                });
            } else {
                await tx.productionMaterial.create({
                    data: {
                        productionOrderId,
                        productVariantId,
                        quantity: totalIssuedNonVoided,
                    },
                });
            }
        });

        return { issueId, idempotent };
    }

    static async deleteMaterialIssue(issueId: string, productionOrderId: string) {
        await prisma.$transaction(async (tx) => {
            const issue = await tx.materialIssue.findUnique({
                where: { id: issueId }
            });
            if (!issue) throw new NotFoundError("MaterialIssue", issueId);

            // ROBUST: Use saved locationId or fallback to rm_warehouse slug only if record is old (NULL locationId)
            let refundLocationId = issue.locationId;
            if (!refundLocationId) {
                const legacyLoc = await tx.location.findUnique({ where: { slug: WAREHOUSE_SLUGS.RAW_MATERIAL } });
                if (!legacyLoc) throw new NotFoundError("Location", WAREHOUSE_SLUGS.RAW_MATERIAL);
                refundLocationId = legacyLoc.id;
            }

            await InventoryCoreService.incrementStock(
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

            const movement = await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: issue.productVariantId,
                    toLocationId: refundLocationId,
                    quantity: issue.quantity,
                    reference: `VOID Issue: ${order?.orderNumber || 'UNKNOWN'}`,
                    batchId: issue.batchId,
                    productionOrderId: productionOrderId // Add structured relation
                }
            });
            await AccountingService.recordInventoryMovement(movement, tx);

            await tx.materialIssue.delete({ where: { id: issueId } });
        });
    }

    // --- Scrap ---

    static async recordScrap(data: ScrapRecordValues & { userId?: string }, existingTx?: Prisma.TransactionClient) {
        const { productionOrderId, productVariantId, locationId, quantity, reason, userId } = data;

        const recordLogic = async (tx: Prisma.TransactionClient) => {
            await InventoryCoreService.incrementStock(
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

            const movement = await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId,
                    toLocationId: locationId,
                    quantity,
                    reference: `Production Scrap: ${order?.orderNumber || 'UNKNOWN'}`,
                    createdById: userId,
                    productionOrderId: productionOrderId // Add structured relation
                }
            });
            await AccountingService.recordInventoryMovement(movement, tx);

            await tx.scrapRecord.create({
                data: { productionOrderId, productVariantId, quantity, reason, createdById: userId, locationId }
            });
        };

        if (existingTx) {
            await recordLogic(existingTx);
        } else {
            await prisma.$transaction(async (tx) => {
                return await recordLogic(tx);
            });
        }

        // if (scrapId) {
        //     await AutoJournalService.handleScrapOutput(scrapId);
        // }
    }

    static async deleteScrap(scrapId: string, productionOrderId: string) {
        await prisma.$transaction(async (tx) => {
            const scrap = await tx.scrapRecord.findUnique({
                where: { id: scrapId },
                include: { productVariant: true }
            });

            if (!scrap) throw new NotFoundError("ScrapRecord", scrapId);

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
                const scrapLoc = await tx.location.findUnique({ where: { slug: WAREHOUSE_SLUGS.SCRAP } });
                if (!scrapLoc) throw new NotFoundError("Location", WAREHOUSE_SLUGS.SCRAP);
                locationId = scrapLoc.id;
            }

            await InventoryCoreService.deductStock(tx, locationId, scrap.productVariantId, scrap.quantity.toNumber());

            const order = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { orderNumber: true }
            });

            const movement = await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId: scrap.productVariantId,
                    fromLocationId: locationId,
                    quantity: scrap.quantity,
                    reference: `VOID Scrap: ${order?.orderNumber || 'UNKNOWN'}`,
                    productionOrderId: productionOrderId // Add structured relation
                }
            });
            await AccountingService.recordInventoryMovement(movement, tx);

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
