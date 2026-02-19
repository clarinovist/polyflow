
import { prisma } from '@/lib/prisma';
import {
    StartExecutionValues,
    StopExecutionValues,
    LogRunningOutputValues,
    ProductionOutputValues,
    LogMachineDowntimeValues
} from '@/lib/schemas/production';
import { ProductionStatus, MovementType, ProductionMaterial, BomItem } from '@prisma/client';
import { InventoryService } from '../inventory-service';
import { ProductionCostService } from './cost-service';
import { AutoJournalService } from '../finance/auto-journal-service';
import { AccountingService } from '../accounting-service';
import { ProductionMaterialService } from './material-service';
import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';

export class ProductionExecutionService {

    /**
     * Start Execution
     */
    static async startExecution(data: StartExecutionValues) {
        const { productionOrderId, machineId, operatorId, shiftId } = data;

        const execution = await prisma.productionExecution.create({
            data: {
                productionOrderId,
                machineId,
                operatorId,
                shiftId,
                startTime: new Date(),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                endTime: null as any,
                quantityProduced: 0,
                scrapQuantity: 0,
            }
        });

        const order = await prisma.productionOrder.findUnique({
            where: { id: productionOrderId },
            select: { status: true }
        });

        if (order?.status === ProductionStatus.RELEASED) {
            await prisma.productionOrder.update({
                where: { id: productionOrderId },
                data: { status: ProductionStatus.IN_PROGRESS }
            });
        }

        return execution;
    }

    /**
     * Stop Execution
     */
    static async stopExecution(data: StopExecutionValues) {
        const { executionId, quantityProduced, scrapQuantity, notes } = data;

        const execution = await prisma.productionExecution.update({
            where: { id: executionId },
            data: {
                endTime: new Date(),
                quantityProduced: { increment: quantityProduced },
                scrapQuantity: { increment: scrapQuantity },
                notes
            }
        });

        const currentOrder = await prisma.productionOrder.findUnique({
            where: { id: execution.productionOrderId },
            select: { actualQuantity: true }
        });

        const newTotal = (currentOrder?.actualQuantity ? Number(currentOrder.actualQuantity) : 0) + quantityProduced;

        await prisma.productionOrder.update({
            where: { id: execution.productionOrderId },
            data: {
                actualQuantity: newTotal,
                status: data.completed ? ProductionStatus.COMPLETED : undefined
            }
        });

        if (quantityProduced > 0) {
            await AutoJournalService.handleProductionOutput(executionId);
        }

        return execution;
    }

    /**
     * Log Production Output (While Running)
     */
    static async logRunningOutput(data: LogRunningOutputValues & { userId?: string }) {
        const { executionId, quantityProduced, scrapQuantity, notes, userId } = data;

        await prisma.$transaction(async (tx) => {
            const execution = await tx.productionExecution.findUniqueOrThrow({
                where: { id: executionId }
            });

            await tx.productionExecution.update({
                where: { id: executionId },
                data: {
                    quantityProduced: { increment: quantityProduced },
                    scrapQuantity: { increment: scrapQuantity },
                    notes: notes ? (execution.notes ? `${execution.notes}\n[Log]: ${notes}` : `[Log]: ${notes}`) : undefined
                }
            });

            const productionOrderId = execution.productionOrderId;
            const currentOrder = await tx.productionOrder.findUniqueOrThrow({
                where: { id: productionOrderId }
            });

            const newTotal = (currentOrder.actualQuantity ? Number(currentOrder.actualQuantity) : 0) + quantityProduced;

            const order = await tx.productionOrder.update({
                where: { id: productionOrderId },
                data: { actualQuantity: newTotal },
                include: {
                    bom: { include: { items: true } },
                    plannedMaterials: true
                }
            });

            const locationId = order.locationId;
            const outputVariantId = order.bom.productVariantId;

            await tx.inventory.upsert({
                where: {
                    locationId_productVariantId: { locationId, productVariantId: outputVariantId }
                },
                update: { quantity: { increment: quantityProduced } },
                create: { locationId, productVariantId: outputVariantId, quantity: quantityProduced }
            });

            let unitCost = 0;
            try {
                unitCost = await ProductionCostService.calculateBatchCOGM(productionOrderId, tx);
            } catch (e) {
                console.warn("COGM Calc failed", e);
            }

            const moveIn = await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: outputVariantId,
                    toLocationId: locationId,
                    quantity: quantityProduced,
                    cost: unitCost,
                    reference: `Production Partial Output: WO#${order.orderNumber}`,
                    productionOrderId: productionOrderId
                }
            });
            await AccountingService.recordInventoryMovement(moveIn, tx).catch(console.error);

            // Update WAC
            const fgInv = await tx.inventory.findUnique({
                where: { locationId_productVariantId: { locationId, productVariantId: outputVariantId } }
            });
            if (fgInv && unitCost > 0) {
                const currentQty = fgInv.quantity.toNumber();
                const oldQty = currentQty - quantityProduced;
                const oldCost = fgInv.averageCost?.toNumber() || 0;
                const newTotalValue = (oldQty * oldCost) + (quantityProduced * unitCost);
                const newAvg = currentQty > 0 ? newTotalValue / currentQty : unitCost;

                await tx.inventory.update({
                    where: { id: fgInv.id },
                    data: { averageCost: newAvg }
                });
            }

            // Backflush
            const itemsToBackflush = order.plannedMaterials.length > 0 ? order.plannedMaterials : (order.bom?.items || []);
            const isUsingPlanned = order.plannedMaterials.length > 0;

            if (itemsToBackflush.length > 0) {
                // Determine Backflush Source Location
                let consumptionLocationId = locationId; // Default to order location
                if (order.bom?.category === 'EXTRUSION') {
                    const mixingLoc = await tx.location.findUnique({ where: { slug: WAREHOUSE_SLUGS.MIXING } });
                    if (mixingLoc) consumptionLocationId = mixingLoc.id;
                } else if (order.bom?.category === 'PACKING') {
                    const fgLoc = await tx.location.findUnique({ where: { slug: WAREHOUSE_SLUGS.FINISHING } });
                    if (fgLoc) consumptionLocationId = fgLoc.id;
                }

                for (const item of itemsToBackflush as (ProductionMaterial | BomItem)[]) {
                    let ratio = 0;
                    if (isUsingPlanned) {
                        ratio = Number(item.quantity) / Number(order.plannedQuantity);
                    } else {
                        ratio = Number(item.quantity) / Number(order.bom!.outputQuantity);
                    }
                    const qtyToDeduct = quantityProduced * ratio;

                    if (qtyToDeduct > 0.0001) {
                        await InventoryService.validateAndLockStock(tx, consumptionLocationId, item.productVariantId, qtyToDeduct);
                        await InventoryService.deductStock(tx, consumptionLocationId, item.productVariantId, qtyToDeduct);
                        const moveOut = await tx.stockMovement.create({
                            data: {
                                type: MovementType.OUT,
                                productVariantId: item.productVariantId,
                                fromLocationId: consumptionLocationId,
                                quantity: qtyToDeduct,
                                reference: `Backflush (Partial): WO#${order.orderNumber}`,
                                productionOrderId: productionOrderId
                            }
                        });
                        await AccountingService.recordInventoryMovement(moveOut, tx).catch(console.error);

                        // Also create MaterialIssue record for tracking consumption in the order plan
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
            }
        });

        if (quantityProduced > 0) {
            await AutoJournalService.handleProductionOutput(executionId);
        }
    }

    /**
     * Record Production Output (Batch/Completed)
     */
    static async addProductionOutput(data: ProductionOutputValues & { userId?: string }) {
        const {
            productionOrderId, machineId, operatorId, shiftId,
            quantityProduced, scrapQuantity, scrapProngkolQty, scrapDaunQty,
            startTime, endTime, notes, userId
        } = data;

        await prisma.$transaction(async (tx) => {
            const executionData: {
                productionOrderId: string;
                machineId?: string | null;
                operatorId?: string | null;
                shiftId?: string | null;
                startTime: Date;
                endTime?: Date | null;
                quantityProduced: number;
                scrapQuantity: number;
                notes?: string | null;
                scrapProngkolQty?: number;
                scrapDaunQty?: number;
            } = {
                productionOrderId, machineId, operatorId, shiftId,
                startTime, endTime, quantityProduced: Number(quantityProduced), scrapQuantity: Number(scrapQuantity), notes
            };
            if (scrapProngkolQty !== undefined) executionData.scrapProngkolQty = Number(scrapProngkolQty);
            if (scrapDaunQty !== undefined) executionData.scrapDaunQty = Number(scrapDaunQty);

            await tx.productionExecution.create({ data: executionData });

            const currentOrder = await tx.productionOrder.findUniqueOrThrow({ where: { id: productionOrderId } });
            const newTotal = (currentOrder.actualQuantity ? Number(currentOrder.actualQuantity) : 0) + quantityProduced;

            const order = await tx.productionOrder.update({
                where: { id: productionOrderId },
                data: { actualQuantity: newTotal },
                include: {
                    bom: { include: { items: true } },
                    plannedMaterials: true
                }
            });

            const locationId = order.locationId;
            const outputVariantId = order.bom.productVariantId;

            await tx.inventory.upsert({
                where: { locationId_productVariantId: { locationId, productVariantId: outputVariantId } },
                update: { quantity: { increment: quantityProduced } },
                create: { locationId, productVariantId: outputVariantId, quantity: quantityProduced }
            });

            let unitCost = 0;
            try {
                unitCost = await ProductionCostService.calculateBatchCOGM(productionOrderId, tx);
            } catch (e) {
                console.warn("COGM Calc failed", e);
            }

            const moveIn = await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: outputVariantId,
                    toLocationId: locationId,
                    quantity: quantityProduced,
                    cost: unitCost,
                    reference: `Production Output: WO#${order.orderNumber}`,
                    productionOrderId: productionOrderId
                }
            });
            await AccountingService.recordInventoryMovement(moveIn, tx).catch(console.error);

            // WAC Update
            const fgInv = await tx.inventory.findUnique({
                where: { locationId_productVariantId: { locationId, productVariantId: outputVariantId } }
            });
            if (fgInv && unitCost > 0) {
                const currentQty = fgInv.quantity.toNumber();
                const oldQty = currentQty - quantityProduced;
                const oldCost = fgInv.averageCost?.toNumber() || 0;
                const newTotalValue = (oldQty * oldCost) + (quantityProduced * unitCost);
                const newAvg = currentQty > 0 ? newTotalValue / currentQty : unitCost;
                await tx.inventory.update({ where: { id: fgInv.id }, data: { averageCost: newAvg } });
            }

            // Backflush
            const itemsToBackflush = order.plannedMaterials.length > 0 ? order.plannedMaterials : (order.bom?.items || []);
            const isUsingPlanned = order.plannedMaterials.length > 0;

            if (itemsToBackflush.length > 0) {
                // Determine Backflush Source Location
                let consumptionLocationId = locationId; // Default to order location
                if (order.bom?.category === 'EXTRUSION') {
                    const mixingLoc = await tx.location.findUnique({ where: { slug: WAREHOUSE_SLUGS.MIXING } });
                    if (mixingLoc) consumptionLocationId = mixingLoc.id;

                } else if (order.bom?.category === 'PACKING') {
                    const fgLoc = await tx.location.findUnique({ where: { slug: WAREHOUSE_SLUGS.FINISHING } });
                    if (fgLoc) consumptionLocationId = fgLoc.id;
                }

                for (const item of itemsToBackflush as (ProductionMaterial | BomItem)[]) {
                    let ratio = 0;
                    if (isUsingPlanned) {
                        ratio = Number(item.quantity) / Number(order.plannedQuantity);
                    } else {
                        ratio = Number(item.quantity) / Number(order.bom!.outputQuantity);
                    }
                    const qtyToDeduct = quantityProduced * ratio;

                    if (qtyToDeduct > 0.0001) {
                        await InventoryService.validateAndLockStock(tx, consumptionLocationId, item.productVariantId, qtyToDeduct);
                        await InventoryService.deductStock(tx, consumptionLocationId, item.productVariantId, qtyToDeduct);

                        // Fetch unit cost from source inventory averageCost for accurate COGM
                        const srcInv = await tx.inventory.findUnique({
                            where: { locationId_productVariantId: { locationId: consumptionLocationId, productVariantId: item.productVariantId } },
                            select: { averageCost: true, productVariant: { select: { standardCost: true, buyPrice: true } } }
                        });
                        const srcUnitCost =
                            Number(srcInv?.averageCost ?? 0) ||
                            Number(srcInv?.productVariant?.standardCost ?? 0) ||
                            Number(srcInv?.productVariant?.buyPrice ?? 0);

                        const moveOut = await tx.stockMovement.create({
                            data: {
                                type: MovementType.OUT,
                                productVariantId: item.productVariantId,
                                fromLocationId: consumptionLocationId,
                                quantity: qtyToDeduct,
                                cost: srcUnitCost > 0 ? srcUnitCost : undefined,
                                reference: `Backflush (Batch): WO#${order.orderNumber}`,
                                productionOrderId: productionOrderId
                            }
                        });
                        await AccountingService.recordInventoryMovement(moveOut, tx).catch(console.error);

                        // Also create MaterialIssue record for tracking consumption in the order plan
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
            }

            // --- SYSTEM: AUTOMATIC SCRAP RECORDING ---
            // If prongkol or daun qty is provided, we record them as actual ScrapRecord
            // so they enter the 'Scrap Warehouse' and become sellable inventory.
            if (scrapProngkolQty > 0 || scrapDaunQty > 0) {
                const scrapLocation = await tx.location.findUnique({
                    where: { slug: WAREHOUSE_SLUGS.SCRAP }
                });

                if (scrapLocation) {
                    // Record Prongkol
                    if (scrapProngkolQty > 0) {
                        const variant = await tx.productVariant.findUnique({
                            where: { skuCode: 'SCRAP-PRONGKOL' }
                        });
                        if (variant) {
                            await ProductionMaterialService.recordScrap({
                                productionOrderId,
                                productVariantId: variant.id,
                                locationId: scrapLocation.id,
                                quantity: scrapProngkolQty,
                                reason: 'Production Process Waste (Lumps)',
                                userId
                            }, tx);
                        } else {
                            console.warn(`Scrap variant SCRAP-PRONGKOL not found. Scrap tracking for this run will be recorded as execution data only.`);
                        }
                    }

                    // Record Daun
                    if (scrapDaunQty > 0) {
                        const variant = await tx.productVariant.findUnique({
                            where: { skuCode: 'SCRAP-DAUN' }
                        });
                        if (variant) {
                            await ProductionMaterialService.recordScrap({
                                productionOrderId,
                                productVariantId: variant.id,
                                locationId: scrapLocation.id,
                                quantity: scrapDaunQty,
                                reason: 'Production Process Waste (Trim)',
                                userId
                            }, tx);
                        } else {
                            console.warn(`Scrap variant SCRAP-DAUN not found. Scrap tracking for this run will be recorded as execution data only.`);
                        }
                    }
                }
            }
        });
    }

    /**
     * Get Active Executions
     */
    static async getActiveExecutions() {
        return await prisma.productionExecution.findMany({
            where: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                endTime: { equals: null as any }
            },
            include: {
                productionOrder: {
                    select: {
                        orderNumber: true,
                        bom: {
                            select: {
                                productVariant: { select: { name: true } }
                            }
                        }
                    }
                },
                operator: true,
                machine: true
            },
            orderBy: {
                startTime: 'desc'
            }
        });
    }

    /**
     * Record Machine Downtime
     */
    static async recordDowntime(data: LogMachineDowntimeValues & { createdById?: string }) {
        const { machineId, reason, startTime, endTime, createdById } = data;
        await prisma.machineDowntime.create({
            data: {
                machineId, reason, startTime, endTime, createdById
            }
        });
    }

    /**
     * Void a Production Execution (Reverses stock movements and output totals)
     */
    static async voidExecution(executionId: string, _userId?: string) {
        await prisma.$transaction(async (tx) => {
            const execution = await tx.productionExecution.findUnique({
                where: { id: executionId },
                include: { productionOrder: true }
            });

            if (!execution) throw new Error("Execution record not found");

            const { productionOrderId, quantityProduced, createdAt } = execution;

            // 1. Find related Stock Movements by time window and Order ID
            const marginMs = 30000; // 30 seconds to be safe
            const startTime = new Date(createdAt.getTime() - marginMs);
            const endTime = new Date(createdAt.getTime() + marginMs);

            const movements = await tx.stockMovement.findMany({
                where: {
                    productionOrderId,
                    createdAt: { gte: startTime, lte: endTime }
                }
            });

            // 2. Reverse Stock Movements
            for (const move of movements) {
                // Prevent recursive voids
                if (move.reference && move.reference.startsWith("VOID:")) continue;

                if (move.type === MovementType.IN) {
                    // Reversing Finished Goods IN -> OUT
                    await InventoryService.deductStock(tx, move.toLocationId!, move.productVariantId, Number(move.quantity));
                    const rev = await tx.stockMovement.create({
                        data: {
                            type: MovementType.OUT,
                            productVariantId: move.productVariantId,
                            fromLocationId: move.toLocationId,
                            quantity: move.quantity,
                            reference: `VOID: ${move.reference}`,
                            productionOrderId
                        }
                    });
                    await AccountingService.recordInventoryMovement(rev, tx).catch(console.error);
                } else if (move.type === MovementType.OUT) {
                    // Reversing Backflush OUT -> IN
                    await InventoryService.incrementStock(tx, move.fromLocationId!, move.productVariantId, Number(move.quantity));
                    const rev = await tx.stockMovement.create({
                        data: {
                            type: MovementType.IN,
                            productVariantId: move.productVariantId,
                            toLocationId: move.fromLocationId,
                            quantity: move.quantity,
                            reference: `VOID: ${move.reference}`,
                            productionOrderId
                        }
                    });
                    await AccountingService.recordInventoryMovement(rev, tx).catch(console.error);
                }
            }

            // 3. Mark Material Issues as VOIDED (Consumption records)
            await tx.materialIssue.updateMany({
                where: {
                    productionOrderId,
                    issuedAt: { gte: startTime, lte: endTime }
                },
                data: { status: 'VOIDED' }
            });

            // 4. Update Production Order Totals & Status
            const currentOrder = await tx.productionOrder.findUniqueOrThrow({ where: { id: productionOrderId } });
            const newTotal = Math.max(0, (currentOrder.actualQuantity ? Number(currentOrder.actualQuantity) : 0) - Number(quantityProduced));

            // Check remaining active executions
            const activeExecutionsCount = await tx.productionExecution.count({
                where: {
                    productionOrderId,
                    id: { not: executionId },
                    status: 'COMPLETED'
                }
            });

            let newStatus: ProductionStatus = currentOrder.status;
            if (activeExecutionsCount === 0) {
                newStatus = ProductionStatus.DRAFT; // Back to before-release state
            } else if (newTotal < Number(currentOrder.plannedQuantity)) {
                newStatus = ProductionStatus.IN_PROGRESS;
            }

            await tx.productionOrder.update({
                where: { id: productionOrderId },
                data: {
                    actualQuantity: newTotal,
                    status: newStatus
                }
            });

            // 5. Update Execution status to VOIDED
            await tx.productionExecution.update({
                where: { id: executionId },
                data: { status: 'VOIDED' }
            });
        });
    }
}
