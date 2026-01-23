
import { prisma } from '@/lib/prisma';
import {
    CreateProductionOrderValues,
    UpdateProductionOrderValues,
    BatchMaterialIssueValues,
    MaterialIssueValues,
    ScrapRecordValues,
    StartExecutionValues,
    StopExecutionValues,
    LogRunningOutputValues,
    ProductionOutputValues,
    QualityInspectionValues,
    LogMachineDowntimeValues
} from '@/lib/schemas/production';
import { ProductionStatus, MovementType, ReservationStatus } from '@prisma/client';
import { InventoryService } from './inventory-service';

export class ProductionService {
    /**
     * Get Initialization Data for Production Forms
     */
    static async getInitData() {
        // Run in parallel
        const [boms, machines, locations, employees, workShifts, rawMaterials] = await Promise.all([
            prisma.bom.findMany({
                include: {
                    productVariant: {
                        include: { product: true }
                    }
                }
            }),
            prisma.machine.findMany({
                where: { status: 'ACTIVE' }
            }),
            prisma.location.findMany(),
            prisma.employee.findMany({
                orderBy: { name: 'asc' }
            }),
            prisma.workShift.findMany({
                where: { status: 'ACTIVE' },
                orderBy: { startTime: 'asc' }
            }),
            prisma.productVariant.findMany({
                where: {
                    product: {
                        productType: 'RAW_MATERIAL'
                    }
                },
                include: {
                    product: true
                },
                orderBy: { name: 'asc' }
            })
        ]);

        // Filter employees by role
        const operators = employees.filter((e) => e.role === 'OPERATOR');
        const helpers = employees.filter((e) => e.role === 'HELPER' || e.role === 'PACKER');

        return {
            boms,
            machines,
            locations,
            operators,
            helpers,
            workShifts,
            rawMaterials
        };
    }

    /**
     * Calculate BOM Requirements with Stock Check
     */
    static async getBomWithInventory(
        bomId: string,
        sourceLocationId: string,
        plannedQuantity: number
    ) {
        if (!bomId || plannedQuantity <= 0) throw new Error("Invalid parameters");

        const bom = await prisma.bom.findUnique({
            where: { id: bomId },
            include: {
                items: {
                    include: {
                        productVariant: true
                    }
                }
            }
        });

        if (!bom) throw new Error("Recipe not found");

        const variantIds = bom.items.map(i => i.productVariantId);

        // Fetch inventory rows in bulk
        const sourceInventoryRows = sourceLocationId
            ? await prisma.inventory.findMany({
                where: {
                    locationId: sourceLocationId,
                    productVariantId: { in: variantIds }
                },
                select: { productVariantId: true, quantity: true }
            })
            : [];

        const sourceStockMap = new Map<string, number>();
        sourceInventoryRows.forEach(r => sourceStockMap.set(r.productVariantId, r.quantity.toNumber()));

        const requestedSourceHasAny = variantIds.some(id => (sourceStockMap.get(id) || 0) > 0);

        let suggestedSourceLocation: { id: string; name: string } | null = null;
        if (sourceLocationId && !requestedSourceHasAny) {
            const rmLocation = await prisma.location.findUnique({
                where: { slug: 'rm_warehouse' },
                select: { id: true, name: true }
            });

            if (rmLocation && rmLocation.id !== sourceLocationId) {
                const rmHasAny = await prisma.inventory.findFirst({
                    where: {
                        locationId: rmLocation.id,
                        productVariantId: { in: variantIds },
                        quantity: { gt: 0 }
                    },
                    select: { id: true }
                });

                if (rmHasAny) suggestedSourceLocation = rmLocation;
            }
        }

        const materialRequirements = bom.items.map((item) => {
            const requiredQty = (Number(item.quantity) / Number(bom.outputQuantity)) * plannedQuantity;

            // Get Stock at Source Location
            const currentStock = sourceLocationId ? (sourceStockMap.get(item.productVariantId) || 0) : 0;

            return {
                productVariantId: item.productVariantId,
                name: item.productVariant.name,
                unit: item.productVariant.primaryUnit,
                stdQty: item.quantity.toNumber(),
                bomOutput: bom.outputQuantity.toNumber(),
                requiredQty, // Keep as number for frontend
                currentStock
            };
        });

        return {
            data: materialRequirements,
            meta: {
                requestedSourceLocationId: sourceLocationId,
                suggestedSourceLocationId: suggestedSourceLocation?.id || null,
                suggestedSourceLocationName: suggestedSourceLocation?.name || null,
            }
        };
    }

    /**
     * Create a new Production Order
     */
    static async createOrder(data: CreateProductionOrderValues) {
        const {
            bomId, plannedQuantity, plannedStartDate, plannedEndDate,
            locationId, orderNumber, notes, salesOrderId
        } = data;

        return await prisma.$transaction(async (tx) => {
            // 1. Create Order
            const newOrder = await tx.productionOrder.create({
                data: {
                    orderNumber: orderNumber || `PO-${Date.now()}`,
                    bomId,
                    plannedQuantity,
                    plannedStartDate,
                    plannedEndDate,
                    locationId,
                    notes,
                    status: ProductionStatus.DRAFT,
                    actualQuantity: 0,
                    salesOrderId: salesOrderId || null
                }
            });

            // 2. Calculate Materials (Standard or Flexible)
            let materialsToCreate = data.items || [];

            if (materialsToCreate.length === 0) {
                // Fetch BOM items to calculate defaults
                const bom = await tx.bom.findUnique({
                    where: { id: bomId },
                    include: { items: true }
                });

                if (bom) {
                    materialsToCreate = bom.items.map(item => ({
                        productVariantId: item.productVariantId,
                        quantity: (Number(item.quantity) / Number(bom.outputQuantity)) * Number(plannedQuantity)
                    }));
                }
            }

            if (materialsToCreate.length > 0) {
                await tx.productionMaterial.createMany({
                    data: materialsToCreate.map(item => ({
                        productionOrderId: newOrder.id,
                        productVariantId: item.productVariantId,
                        quantity: item.quantity
                    }))
                });
            }

            return newOrder;
        });
    }

    /**
     * Create Production Order from Sales Order (Shortage)
     */
    static async createOrderFromSales(salesOrderId: string, productVariantId: string, quantity: number) {
        if (!salesOrderId || !productVariantId || quantity <= 0) {
            throw new Error("Invalid parameters");
        }

        // 1. Find default BOM
        const bom = await prisma.bom.findFirst({
            where: {
                productVariantId,
                isDefault: true
            }
        });

        if (!bom) {
            throw new Error("No default BOM found for this product. Please create one first.");
        }

        // 2. Fetch Sales Order
        const so = await prisma.salesOrder.findUnique({
            where: { id: salesOrderId },
            select: { sourceLocationId: true, expectedDate: true }
        });

        if (!so) throw new Error("Sales Order not found");

        // 3. Create PO
        return await this.createOrder({
            bomId: bom.id,
            plannedQuantity: quantity,
            plannedStartDate: new Date(),
            plannedEndDate: so.expectedDate || undefined,
            locationId: so.sourceLocationId || '',
            salesOrderId,
            notes: `Auto-generated from Sales Order shortage.`
        });
    }

    /**
     * Update Production Order
     */
    static async updateOrder(data: UpdateProductionOrderValues) {
        const { id, status, actualQuantity, actualStartDate, actualEndDate, machineId } = data;

        return await prisma.productionOrder.update({
            where: { id },
            data: {
                status,
                actualQuantity,
                actualStartDate,
                actualEndDate,
                machineId,
            }
        });
    }

    /**
     * Delete Production Order (Draft Only)
     */
    static async deleteOrder(id: string) {
        const order = await prisma.productionOrder.findUnique({
            where: { id },
            select: { status: true }
        });

        if (!order) {
            throw new Error("Order not found");
        }

        if (order.status !== 'DRAFT') {
            throw new Error("Only DRAFT orders can be deleted.");
        }

        await prisma.$transaction(async (tx) => {
            await tx.productionShift.deleteMany({ where: { productionOrderId: id } });
            await tx.productionMaterial.deleteMany({ where: { productionOrderId: id } });
            await tx.productionOrder.delete({ where: { id } });
        });
    }

    /**
     * Add Shift to Production Order
     */
    static async addShift(data: {
        productionOrderId: string,
        shiftName: string,
        startTime: Date,
        endTime: Date,
        operatorId?: string,
        helperIds?: string[],
        machineId?: string
    }) {
        await prisma.$transaction(async (tx) => {
            await tx.productionShift.create({
                data: {
                    productionOrderId: data.productionOrderId,
                    shiftName: data.shiftName,
                    startTime: data.startTime,
                    endTime: data.endTime,
                    operatorId: data.operatorId,
                    helpers: data.helperIds ? {
                        connect: data.helperIds.map(id => ({ id }))
                    } : undefined
                }
            });

            if (data.machineId) {
                await tx.productionOrder.update({
                    where: { id: data.productionOrderId },
                    data: { machineId: data.machineId }
                });
            }
        });
    }

    /**
    * Delete Production Shift
    */
    static async deleteShift(shiftId: string) {
        await prisma.productionShift.delete({
            where: { id: shiftId }
        });
    }

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

            // 5. Stock Movement (Output)
            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: outputVariantId,
                    toLocationId: locationId,
                    quantity: quantityProduced,
                    reference: `Production Partial Output: PO-${order.orderNumber}`,
                }
            });

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
            // Note: We cast to any for scrapProngkolQty/scrapDaunQty in case they are not in Prisma type yet
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

            // Conditionally add extras to avoid TS error if fields don't exist in type
            // (Assuming the DB has them, but safety first for the build)
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
            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: outputVariantId,
                    toLocationId: locationId,
                    quantity: quantityProduced,
                    reference: `Production Output: PO-${order.orderNumber}`,
                }
            });

            // 5. Backflush Raw Materials
            if (order.bom && order.bom.items.length > 0) {
                for (const item of order.bom.items) {
                    const ratio = Number(item.quantity) / Number(order.bom.outputQuantity);
                    const qtyToDeduct = quantityProduced * ratio;

                    if (qtyToDeduct > 0.0001) {
                        // Check inventory (Phase 2: Use InventoryService)
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

                        // Soft check for availability (don't block backflush strictly if slight mismatch, but good practice)
                        // Use raw SQL for speed or simple check
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
                            // warn but maybe proceed? Stick to strict for now to match logRunningOutput
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
     * Record Quality Inspection
     */
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

    // --- Provisional methods (To be refactored in Phase 2 with InventoryService) ---

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
                        reference: `PROD-ISSUE-${productionOrderId.slice(0, 8)}`,
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

            await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId,
                    fromLocationId: locationId,
                    quantity,
                    reference: `Production Consumption: PO-${productionOrderId.slice(0, 8)}`
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

            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: issue.productVariantId,
                    toLocationId: refundLocation.id,
                    quantity: issue.quantity,
                    reference: `VOID Issue: PO-${productionOrderId.slice(0, 8)}`
                }
            });

            await tx.materialIssue.delete({ where: { id: issueId } });
        });
    }

    static async recordScrap(data: ScrapRecordValues) {
        const { productionOrderId, productVariantId, locationId, quantity, reason } = data;

        await prisma.$transaction(async (tx) => {
            await InventoryService.incrementStock(
                tx,
                locationId,
                productVariantId,
                quantity
            );

            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId,
                    toLocationId: locationId,
                    quantity,
                    reference: `Production Scrap: PO-${productionOrderId.slice(0, 8)}`
                }
            });

            await tx.scrapRecord.create({
                data: { productionOrderId, productVariantId, quantity, reason }
            });
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
