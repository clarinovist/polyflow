
import { prisma } from '@/lib/core/prisma';
import {
    StartExecutionValues,
    StopExecutionValues,
    LogRunningOutputValues,
    ProductionOutputValues,
    LogMachineDowntimeValues
} from '@/lib/schemas/production';
import { ProductionStatus, MovementType, ProductionExecution } from '@prisma/client';
import { InventoryCoreService } from '@/services/inventory/core-service';
import { AccountingService } from '../accounting/accounting-service';
import {
    backflushMaterials,
    recordExecutionScrap,
    recordFinishedGoodsOutput,
    triggerProductionOutputJournal,
    type ProductionExecutionOrder,
} from './execution-helpers';

export class ProductionExecutionService {

    /**
     * Start Execution
     */
    static async startExecution(data: StartExecutionValues) {
        const { productionOrderId, machineId, operatorId, shiftId } = data;

        return await prisma.$transaction(async (tx) => {
            const execution = await tx.productionExecution.create({
                data: {
                    productionOrderId,
                    machineId,
                    operatorId,
                    shiftId,
                    startTime: new Date(),
                    endTime: null as unknown as Date,
                    quantityProduced: 0,
                    scrapQuantity: 0,
                }
            });

            const order = await tx.productionOrder.findUnique({
                where: { id: productionOrderId },
                select: { status: true }
            });

            if (order?.status === ProductionStatus.RELEASED) {
                await tx.productionOrder.update({
                    where: { id: productionOrderId },
                    data: { status: ProductionStatus.IN_PROGRESS }
                });
            }

            return execution;
        });
    }

    /**
     * Stop Execution
     */
    static async stopExecution(data: StopExecutionValues & { userId?: string }) {
        const { executionId, quantityProduced, scrapQuantity, notes, userId } = data;

        let finalExecution!: ProductionExecution;
        await prisma.$transaction(async (tx) => {
            finalExecution = await tx.productionExecution.update({
                where: { id: executionId },
                data: {
                    endTime: new Date(),
                    quantityProduced: { increment: quantityProduced },
                    scrapQuantity: { increment: scrapQuantity },
                    notes: notes ? `[Stopped]: ${notes}` : undefined
                }
            });

            const productionOrderId = finalExecution.productionOrderId;
            const currentOrder = await tx.productionOrder.findUniqueOrThrow({
                where: { id: productionOrderId }
            });

            const newTotal = (currentOrder.actualQuantity ? Number(currentOrder.actualQuantity) : 0) + quantityProduced;

            const order = await tx.productionOrder.update({
                where: { id: productionOrderId },
                data: {
                    actualQuantity: newTotal,
                    status: data.completed ? ProductionStatus.COMPLETED : undefined
                },
                include: {
                    bom: { include: { items: true } },
                    plannedMaterials: true
                }
            });

            if (data.completed && order.isMaklon) {
                // Generate GL Journal for all previously and currently captured MaklonCostItems
                await AccountingService.recordMaklonCosts(productionOrderId, tx);
            }

            await recordFinishedGoodsOutput({
                tx,
                productionOrderId,
                order: order as ProductionExecutionOrder,
                quantityProduced,
                reference: `Production Output (Stop): WO#${order.orderNumber}`,
            });

            const totalConsumed = quantityProduced + scrapQuantity;
            await backflushMaterials({
                tx,
                order: order as ProductionExecutionOrder,
                productionOrderId,
                totalConsumed,
                reference: `Backflush (Stop): WO#${order.orderNumber}`,
                userId,
            });
        });

        await triggerProductionOutputJournal(executionId, quantityProduced);

        return finalExecution;
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

            await recordFinishedGoodsOutput({
                tx,
                productionOrderId,
                order: order as ProductionExecutionOrder,
                quantityProduced,
                reference: `Production Partial Output: WO#${order.orderNumber}`,
            });

            await backflushMaterials({
                tx,
                order: order as ProductionExecutionOrder,
                productionOrderId,
                totalConsumed: quantityProduced + scrapQuantity,
                reference: `Backflush (Partial): WO#${order.orderNumber}`,
                userId,
            });
        });

        await triggerProductionOutputJournal(executionId, quantityProduced);
    }

    /**
     * Record Production Output (Batch/Completed)
     */
    static async addProductionOutput(data: ProductionOutputValues & { userId?: string }) {
        const {
            productionOrderId, machineId, operatorId, shiftId, helperIds,
            quantityProduced, scrapQuantity, scrapProngkolQty, scrapDaunQty,
            bruto, bobin, cekGram,
            startTime, endTime, notes, userId
        } = data;

        await prisma.$transaction(async (tx) => {
            // Validate: qty=0 only allowed for REWORK orders
            if (quantityProduced === 0) {
                const checkOrder = await tx.productionOrder.findUniqueOrThrow({
                    where: { id: productionOrderId },
                    include: { bom: { select: { category: true } } }
                });
                if (checkOrder.bom?.category !== 'REWORK') {
                    throw new Error('Output quantity must be greater than 0 for non-Rework orders');
                }
            }

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
                bruto?: number | null;
                bobin?: number | null;
                cekGram?: string | null;
                helpers?: { connect: { id: string }[] };
            } = {
                productionOrderId, machineId, operatorId, shiftId,
                startTime, endTime, quantityProduced: Number(quantityProduced), scrapQuantity: Number(scrapQuantity), notes
            };
            if (scrapProngkolQty !== undefined) executionData.scrapProngkolQty = Number(scrapProngkolQty);
            if (scrapDaunQty !== undefined) executionData.scrapDaunQty = Number(scrapDaunQty);
            if (bruto !== undefined) executionData.bruto = Number(bruto);
            if (bobin !== undefined) executionData.bobin = Number(bobin);
            if (cekGram !== undefined) executionData.cekGram = cekGram;
            if (helperIds && helperIds.length > 0) {
                executionData.helpers = { connect: helperIds.map(id => ({ id })) };
            }

            const execution = await tx.productionExecution.create({ data: executionData });

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

            await recordFinishedGoodsOutput({
                tx,
                productionOrderId,
                order: order as ProductionExecutionOrder,
                quantityProduced,
                reference: `Production Output: WO#${order.orderNumber}`,
            });

            await backflushMaterials({
                tx,
                order: order as ProductionExecutionOrder,
                productionOrderId,
                totalConsumed: quantityProduced + Number(scrapQuantity) + Number(scrapProngkolQty ?? 0) + Number(scrapDaunQty ?? 0),
                reference: `Backflush (Batch): WO#${order.orderNumber}`,
                userId,
            });

            await recordExecutionScrap({
                tx,
                productionOrderId,
                executionId: execution.id,
                scrapQuantity: Number(scrapQuantity),
                scrapProngkolQty: Number(scrapProngkolQty ?? 0),
                scrapDaunQty: Number(scrapDaunQty ?? 0),
                userId,
            });
        });
    }

    /**
     * Get Active Executions
     */
    static async getActiveExecutions() {
        return await prisma.productionExecution.findMany({
            where: {
                endTime: { equals: null }
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
            if (execution.status === 'VOIDED') throw new Error("Execution has already been voided");
            if (execution.status !== 'COMPLETED') throw new Error("Only completed executions can be voided");

            const { productionOrderId, quantityProduced, createdAt } = execution;

            // 1. Isolate the execution's own movement window so nearby executions on the same
            //    work order are not accidentally reversed together.
            const marginMs = 30000;
            const previousExecution = await tx.productionExecution.findFirst({
                where: {
                    productionOrderId,
                    createdAt: { lt: createdAt }
                },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true }
            });
            const nextExecution = await tx.productionExecution.findFirst({
                where: {
                    productionOrderId,
                    createdAt: { gt: createdAt }
                },
                orderBy: { createdAt: 'asc' },
                select: { createdAt: true }
            });

            const startTime = previousExecution
                ? new Date((previousExecution.createdAt.getTime() + createdAt.getTime()) / 2)
                : new Date(createdAt.getTime() - marginMs);
            const endTime = nextExecution
                ? new Date((nextExecution.createdAt.getTime() + createdAt.getTime()) / 2)
                : new Date(createdAt.getTime() + marginMs);

            const movements = await tx.stockMovement.findMany({
                where: {
                    productionOrderId,
                    createdAt: nextExecution
                        ? { gte: startTime, lt: endTime }
                        : { gte: startTime, lte: endTime }
                }
            });

            // 2. Reverse Stock Movements
            for (const move of movements) {
                // Prevent recursive voids
                if (move.reference && move.reference.startsWith("VOID:")) continue;

                if (move.type === MovementType.IN) {
                    // Reversing Finished Goods IN -> OUT
                    await InventoryCoreService.deductStock(tx, move.toLocationId!, move.productVariantId, Number(move.quantity));
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
                    await AccountingService.recordInventoryMovement(rev, tx);
                } else if (move.type === MovementType.OUT) {
                    // Reversing Backflush OUT -> IN
                    await InventoryCoreService.incrementStock(tx, move.fromLocationId!, move.productVariantId, Number(move.quantity));
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
                    await AccountingService.recordInventoryMovement(rev, tx);
                }
            }

            // 3. Mark Material Issues as VOIDED (Consumption records)
            await tx.materialIssue.updateMany({
                where: {
                    productionOrderId,
                    issuedAt: nextExecution
                        ? { gte: startTime, lt: endTime }
                        : { gte: startTime, lte: endTime }
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
