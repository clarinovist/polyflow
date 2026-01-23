import { prisma } from '@/lib/prisma';
import {
    StartExecutionValues,
    StopExecutionValues,
    LogRunningOutputValues,
    ProductionOutputValues,
    LogMachineDowntimeValues
} from '@/lib/schemas/production';
import { ProductionStatus, MovementType, ReservationStatus } from '@prisma/client';
import { InventoryService } from '../inventory-service';
import { ProductionCostService } from './cost-service';

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

        return execution;
    }

    /**
     * Log Production Output (While Running)
     */
    static async logRunningOutput(data: LogRunningOutputValues) {
        const { executionId, quantityProduced, scrapQuantity, notes } = data;

        await prisma.$transaction(async (tx) => {
            // 1. Get current execution
            const execution = await tx.productionExecution.findUniqueOrThrow({
                where: { id: executionId }
            });

            // 2. Update Execution
            await tx.productionExecution.update({
                where: { id: executionId },
                data: {
                    quantityProduced: { increment: quantityProduced },
                    scrapQuantity: { increment: scrapQuantity },
                    notes: notes ? (execution.notes ? `${execution.notes}\n[Log]: ${notes}` : `[Log]: ${notes}`) : undefined
                }
            });

            const productionOrderId = execution.productionOrderId;

            // 3. Update Order
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

            // 4. Update Finished Goods Inventory
            await tx.inventory.upsert({
                where: {
                    locationId_productVariantId: { locationId, productVariantId: outputVariantId }
                },
                update: { quantity: { increment: quantityProduced } },
                create: { locationId, productVariantId: outputVariantId, quantity: quantityProduced }
            });

            // Calculate COGM (Running)
            let unitCost = 0;
            try {
                unitCost = await ProductionCostService.calculateBatchCOGM(productionOrderId, tx);
            } catch (e) {
                console.warn("COGM Calc failed", e);
            }

            // 5. Stock Movement (Output)
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

            // 6. Backflush Raw Materials
            if (order.bom && order.bom.items.length > 0) {
                for (const item of order.bom.items) {
                    const ratio = Number(item.quantity) / Number(order.bom.outputQuantity);
                    const qtyToDeduct = quantityProduced * ratio;

                    if (qtyToDeduct > 0.0001) {
                        // Use InventoryService to check and lock
                        await InventoryService.validateAndLockStock(
                            tx,
                            locationId,
                            item.productVariantId,
                            qtyToDeduct
                        );

                        // Deduct
                        await InventoryService.deductStock(
                            tx,
                            locationId,
                            item.productVariantId,
                            qtyToDeduct
                        );

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

        await prisma.$transaction(async (tx) => {
            // 1. Create Execution Record
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const executionData: any = {
                productionOrderId,
                machineId,
                operatorId,
                shiftId,
                startTime,
                endTime,
                quantityProduced,
                scrapQuantity,
                notes
            };

            if (scrapProngkolQty !== undefined) executionData['scrapProngkolQty'] = scrapProngkolQty;
            if (scrapDaunQty !== undefined) executionData['scrapDaunQty'] = scrapDaunQty;

            await tx.productionExecution.create({
                data: executionData
            });

            // 2. Update Order
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

            // 3. Update Finished Goods Inventory
            await tx.inventory.upsert({
                where: {
                    locationId_productVariantId: { locationId, productVariantId: outputVariantId }
                },
                update: { quantity: { increment: quantityProduced } },
                create: { locationId, productVariantId: outputVariantId, quantity: quantityProduced }
            });

            // 4. Stock Movement (Output)
            // Calculate COGM
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

            // 5. Backflush Raw Materials
            if (order.bom && order.bom.items.length > 0) {
                for (const item of order.bom.items) {
                    const ratio = Number(item.quantity) / Number(order.bom.outputQuantity);
                    const qtyToDeduct = quantityProduced * ratio;

                    if (qtyToDeduct > 0.0001) {
                        // Check inventory
                        const invRow = await tx.inventory.findUnique({
                            where: {
                                locationId_productVariantId: {
                                    locationId,
                                    productVariantId: item.productVariantId
                                }
                            },
                            select: { quantity: true }
                        });

                        const physicalQty = invRow?.quantity.toNumber() || 0;

                        const resAgg = await tx.stockReservation.aggregate({
                            where: {
                                locationId,
                                productVariantId: item.productVariantId,
                                status: ReservationStatus.ACTIVE
                            },
                            _sum: { quantity: true }
                        });

                        const reservedQty = resAgg._sum.quantity?.toNumber() || 0;
                        const availableQty = physicalQty - reservedQty;

                        if (availableQty < qtyToDeduct) {
                            const variant = await tx.productVariant.findUnique({ where: { id: item.productVariantId }, select: { name: true } });
                            throw new Error(`Insufficient available stock for ${variant?.name || item.productVariantId} at location. Available: ${availableQty}, Required: ${qtyToDeduct}`);
                        }

                        await tx.inventory.update({
                            where: {
                                locationId_productVariantId: {
                                    locationId,
                                    productVariantId: item.productVariantId
                                }
                            },
                            data: { quantity: { decrement: qtyToDeduct } }
                        });

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
                machineId,
                reason,
                startTime,
                endTime,
                createdById
            }
        });
    }
}
