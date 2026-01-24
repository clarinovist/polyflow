
import { prisma } from '@/lib/prisma';
import {
    StartExecutionValues,
    StopExecutionValues,
    LogRunningOutputValues,
    ProductionOutputValues,
    LogMachineDowntimeValues
} from '@/lib/schemas/production';
import { ProductionStatus, MovementType } from '@prisma/client';
import { InventoryService } from '../inventory-service';
import { ProductionCostService } from './cost-service';
import { AutoJournalService } from '../finance/auto-journal-service';

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
    static async logRunningOutput(data: LogRunningOutputValues) {
        const { executionId, quantityProduced, scrapQuantity, notes } = data;

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
                include: { bom: { include: { items: true } } }
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

            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: outputVariantId,
                    toLocationId: locationId,
                    quantity: quantityProduced,
                    cost: unitCost,
                    reference: `Production Partial Output: PO-${order.orderNumber}`,
                }
            });

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
            if (order.bom && order.bom.items.length > 0) {
                for (const item of order.bom.items) {
                    const ratio = Number(item.quantity) / Number(order.bom.outputQuantity);
                    const qtyToDeduct = quantityProduced * ratio;

                    if (qtyToDeduct > 0.0001) {
                        await InventoryService.validateAndLockStock(tx, locationId, item.productVariantId, qtyToDeduct);
                        await InventoryService.deductStock(tx, locationId, item.productVariantId, qtyToDeduct);
                        await tx.stockMovement.create({
                            data: {
                                type: MovementType.OUT,
                                productVariantId: item.productVariantId,
                                fromLocationId: locationId,
                                quantity: qtyToDeduct,
                                reference: `Backflush (Partial): PO-${order.orderNumber}`
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
    static async addProductionOutput(data: ProductionOutputValues) {
        const {
            productionOrderId, machineId, operatorId, shiftId,
            quantityProduced, scrapQuantity, scrapProngkolQty, scrapDaunQty,
            startTime, endTime, notes
        } = data;

        let executionId = '';

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

            const execution = await tx.productionExecution.create({ data: executionData });
            executionId = execution.id;

            const currentOrder = await tx.productionOrder.findUniqueOrThrow({ where: { id: productionOrderId } });
            const newTotal = (currentOrder.actualQuantity ? Number(currentOrder.actualQuantity) : 0) + quantityProduced;

            const order = await tx.productionOrder.update({
                where: { id: productionOrderId },
                data: { actualQuantity: newTotal },
                include: { bom: { include: { items: true } } }
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

            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: outputVariantId,
                    toLocationId: locationId,
                    quantity: quantityProduced,
                    cost: unitCost,
                    reference: `Production Output: PO-${order.orderNumber}`,
                }
            });

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
            if (order.bom && order.bom.items.length > 0) {
                for (const item of order.bom.items) {
                    const ratio = Number(item.quantity) / Number(order.bom.outputQuantity);
                    const qtyToDeduct = quantityProduced * ratio;
                    if (qtyToDeduct > 0.0001) {
                        await InventoryService.validateAndLockStock(tx, locationId, item.productVariantId, qtyToDeduct);
                        await InventoryService.deductStock(tx, locationId, item.productVariantId, qtyToDeduct);
                        await tx.stockMovement.create({
                            data: {
                                type: MovementType.OUT,
                                productVariantId: item.productVariantId,
                                fromLocationId: locationId,
                                quantity: qtyToDeduct,
                                reference: `Backflush (Batch): PO-${order.orderNumber}`
                            }
                        });
                    }
                }
            }
        });

        if (executionId && quantityProduced > 0) {
            await AutoJournalService.handleProductionOutput(executionId);
        }
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
}
