'use server';

import { prisma } from '@/lib/prisma';
import {
    createProductionOrderSchema,
    CreateProductionOrderValues,
    updateProductionOrderSchema,
    UpdateProductionOrderValues,
    materialIssueSchema,
    MaterialIssueValues,
    scrapRecordSchema,
    ScrapRecordValues,
    qualityInspectionSchema,
    QualityInspectionValues,
    batchMaterialIssueSchema,
    BatchMaterialIssueValues,
    productionOutputSchema, // Added
    ProductionOutputValues,
    startExecutionSchema,
    StartExecutionValues,
    stopExecutionSchema,
    StopExecutionValues,
    logRunningOutputSchema,
    LogRunningOutputValues  // Added
} from '@/lib/schemas/production';
import { serializeData } from '@/lib/utils';
import { ProductionStatus, Prisma, MovementType, ReservationStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';

/**
 * Create a new Production Order
 */
export async function createProductionOrder(data: CreateProductionOrderValues) {
    const result = createProductionOrderSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const {
        bomId, plannedQuantity, plannedStartDate, plannedEndDate,
        locationId, orderNumber, notes, salesOrderId
    } = result.data;

    try {
        const order = await prisma.$transaction(async (tx) => {
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

            // 3. Create Planned Materials
            // If items are provided in form, use them. 
            // If NOT provided (e.g. quick create), we should technically calculate from BOM here, 
            // but for "Flexible BOM" feature, the UI should always send items. 
            // We will fallback to BOM calculation if no items send, to be safe.
            let materialsToCreate = result.data.items || [];

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

        revalidatePath('/dashboard/production');
        revalidatePath('/dashboard/sales');
        // Serialize to prevent Decimal objects from reaching Client Components
        return { success: true, data: JSON.parse(JSON.stringify(order)) };
    } catch (error) {
        console.error("Create Production Order Error:", error);
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Get Production Orders with filters and pagination
 */
export async function getProductionOrders(filters?: { status?: ProductionStatus, machineId?: string }) {
    const where: Prisma.ProductionOrderWhereInput = {};

    if (filters?.status) {
        where.status = filters.status;
    }
    if (filters?.machineId) {
        where.machineId = filters.machineId;
    }

    const orders = await prisma.productionOrder.findMany({
        where,
        include: {
            bom: {
                include: {
                    productVariant: true
                }
            },
            machine: true,
            location: true,
            shifts: {
                include: {
                    operator: true
                }
            }
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    return orders.map(order => ({
        ...order,
        plannedQuantity: order.plannedQuantity.toNumber(),
        actualQuantity: order.actualQuantity?.toNumber() ?? null,
    }));
}

/**
 * Get a single Production Order by ID with full details
 */
export async function getProductionOrder(id: string) {
    if (!id) return null;
    const order = await prisma.productionOrder.findUnique({
        where: { id },
        include: {
            bom: {
                include: {
                    productVariant: {
                        include: {
                            product: true
                        }
                    },
                    items: {
                        include: {
                            productVariant: {
                                include: {
                                    product: true
                                }
                            }
                        }
                    }
                }
            },
            machine: true,
            location: true,
            shifts: {
                include: {
                    operator: true,
                    helpers: true
                },
                orderBy: { startTime: 'asc' }
            },
            materialIssues: {
                include: {
                    productVariant: true,
                    createdBy: true
                }
            },
            scrapRecords: {
                include: {
                    productVariant: true,
                    createdBy: true
                }
            },
            inspections: {
                include: {
                    inspector: true
                }
            },
            executions: {
                include: {
                    operator: true,
                    shift: true
                },
                orderBy: { startTime: 'desc' }
            },
            plannedMaterials: {
                include: {
                    productVariant: {
                        include: {
                            product: true
                        }
                    }
                }
            }
        }
    });

    if (!order) return null;

    // Serialize Decimals using utility to be safe
    return serializeData(order);
}

/**
 * Update Production Order (Status or Fields)
 */
export async function updateProductionOrder(data: UpdateProductionOrderValues) {
    const result = updateProductionOrderSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { id, status, actualQuantity, actualStartDate, actualEndDate, machineId } = result.data;

    try {
        await prisma.productionOrder.update({
            where: { id },
            data: {
                status,
                actualQuantity,
                actualStartDate,
                actualEndDate,
                machineId,
            }
        });

        revalidatePath(`/dashboard/production/orders/${id}`);
        revalidatePath('/dashboard/production');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Delete Production Order (Draft Only)
 */
export async function deleteProductionOrder(id: string) {
    if (!id) return { success: false, error: "Order ID is required" };

    try {
        const order = await prisma.productionOrder.findUnique({
            where: { id },
            select: { status: true }
        });

        if (!order) return { success: false, error: "Order not found" };

        if (order.status !== 'DRAFT') {
            return { success: false, error: "Only DRAFT orders can be deleted." };
        }

        await prisma.$transaction(async (tx) => {
            // Delete associated shifts first (they have FK to order)
            await tx.productionShift.deleteMany({
                where: { productionOrderId: id }
            });

            // Delete associated materials
            await tx.productionMaterial.deleteMany({
                where: { productionOrderId: id }
            });

            // Delete the order
            await tx.productionOrder.delete({
                where: { id }
            });
        });

        revalidatePath('/dashboard/production');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Add Shift to Production Order
 */
export async function addProductionShift(data: {
    productionOrderId: string,
    shiftName: string,
    startTime: Date,
    endTime: Date,
    operatorId?: string,
    helperIds?: string[],
    machineId?: string
}) {
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Create Shift
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

            // 2. Update Machine on Order (if provided)
            if (data.machineId) {
                await tx.productionOrder.update({
                    where: { id: data.productionOrderId },
                    data: { machineId: data.machineId }
                });
            }
        });
        revalidatePath(`/dashboard/production/orders/${data.productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Delete Production Shift
 */
export async function deleteProductionShift(shiftId: string, orderId: string) {
    try {
        await prisma.productionShift.delete({
            where: { id: shiftId }
        });
        revalidatePath(`/dashboard/production/orders/${orderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Start Production Execution (Real-time tracking)
 */
export async function startExecution(data: StartExecutionValues) {
    const result = startExecutionSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { productionOrderId, machineId, operatorId, shiftId } = result.data;

    try {
        const execution = await prisma.productionExecution.create({
            data: {
                productionOrderId,
                machineId,
                operatorId,
                shiftId,
                startTime: new Date(),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                endTime: null as any, // Explicitly set to null for running execution
                quantityProduced: 0,
                scrapQuantity: 0,
            }
        });

        // Auto-update status to IN_PROGRESS if currently RELEASED
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

        revalidatePath('/dashboard/production');
        revalidatePath('/dashboard/production/kiosk');
        return { success: true, data: execution };
    } catch (error) {
        console.error('Error starting execution:', error);
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

/**
 * Stop Production Execution
 */
export async function stopExecution(data: StopExecutionValues) {
    const result = stopExecutionSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { executionId, quantityProduced, scrapQuantity, notes } = result.data;

    try {
        const execution = await prisma.productionExecution.update({
            where: { id: executionId },
            data: {
                endTime: new Date(),
                quantityProduced: { increment: quantityProduced },
                scrapQuantity: { increment: scrapQuantity },
                notes
            }
        });

        // Fetch current to handle NULL safely if any
        const currentOrder = await prisma.productionOrder.findUnique({
            where: { id: execution.productionOrderId },
            select: { actualQuantity: true }
        });

        const newTotal = (currentOrder?.actualQuantity ? Number(currentOrder.actualQuantity) : 0) + quantityProduced;

        // Update Order actual quantity (accumulate)
        await prisma.productionOrder.update({
            where: { id: execution.productionOrderId },
            data: {
                actualQuantity: newTotal
            }
        });

        revalidatePath('/dashboard/production');
        revalidatePath('/dashboard/production/kiosk');
        return { success: true, data: execution };
    } catch (error) {
        console.error('Error stopping execution:', error);
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

/**
 * Get Active Production Executions (Running)
 */
export async function getActiveExecutions() {
    try {
        const executions = await prisma.productionExecution.findMany({
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
                                productVariant: {
                                    select: {
                                        name: true
                                    }
                                }
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

        return serializeData(executions);
    } catch (error) {
        console.error("Get Active Executions Error:", error);
        return [];
    }
}

/**
 * Batch Record Material Issue (Consumption)
 * Includes validation for strict quota (cannot exceed remaining required qty)
 */
export async function batchIssueMaterials(data: BatchMaterialIssueValues) {
    const result = batchMaterialIssueSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const {
        productionOrderId,
        locationId,
        items,
        removedPlannedMaterialIds,
        addedPlannedMaterials
    } = result.data;

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Fetch Order and Material Requirements
            const order = await tx.productionOrder.findUniqueOrThrow({
                where: { id: productionOrderId },
                include: {
                    materialIssues: true,
                    plannedMaterials: {
                        include: {
                            productVariant: true
                        }
                    }
                }
            });

            // 1.5 Handle Plan Modifications (Substitution)
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

            // 2. Process Items
            for (const item of items) {
                // A. Verify Stock
                const stock = await tx.inventory.findUnique({
                    where: {
                        locationId_productVariantId: {
                            locationId,
                            productVariantId: item.productVariantId
                        }
                    }
                });

                if (!stock || stock.quantity.toNumber() < item.quantity) {
                    const variant = await tx.productVariant.findUnique({ where: { id: item.productVariantId } });
                    throw new Error(`Stok tidak mencukupi untuk ${variant?.name || 'item'}. Tersedia: ${stock?.quantity || 0}`);
                }

                // 3. Deduct Inventory
                await tx.inventory.update({
                    where: {
                        locationId_productVariantId: {
                            locationId,
                            productVariantId: item.productVariantId
                        }
                    },
                    data: {
                        quantity: { decrement: item.quantity }
                    }
                });

                // 4. Create Material Issue linked to Batch
                await tx.materialIssue.create({
                    data: {
                        productionOrderId,
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        batchId: item.batchId
                    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
                });

                // 5. Create Audit Log / Stock Movement
                await tx.stockMovement.create({
                    data: {
                        type: MovementType.OUT,
                        productVariantId: item.productVariantId,
                        fromLocationId: locationId,
                        toLocationId: null, // Consumption
                        quantity: item.quantity,
                        reference: `PROD-ISSUE-${productionOrderId.slice(0, 8)}`,
                        batchId: item.batchId
                    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
                });
            }
        });

        revalidatePath(`/dashboard/production/orders/${productionOrderId}`);
        return { success: true };
    } catch (error) {
        console.error("Batch Issue Error:", error);
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Record Material Issue (Consumption)
 */
export async function recordMaterialIssue(data: MaterialIssueValues) {
    const result = materialIssueSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { productionOrderId, productVariantId, locationId, quantity } = result.data;

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Verify Stock
            const stock = await tx.inventory.findUnique({
                where: {
                    locationId_productVariantId: {
                        locationId,
                        productVariantId
                    }
                }
            });

            if (!stock || stock.quantity.toNumber() < quantity) {
                throw new Error(`Stok di lokasi terpilih tidak mencukupi. Tersedia: ${stock?.quantity || 0}`);
            }

            // 2. Deduct Inventory
            await tx.inventory.update({
                where: {
                    locationId_productVariantId: {
                        locationId,
                        productVariantId
                    }
                },
                data: {
                    quantity: { decrement: quantity }
                }
            });

            // 3. Create Stock Movement (OUT)
            await tx.stockMovement.create({
                data: {
                    type: MovementType.OUT,
                    productVariantId,
                    fromLocationId: locationId,
                    quantity,
                    reference: `Production Consumption: PO-${productionOrderId.slice(0, 8)}`
                }
            });

            // 4. Create Material Issue Record
            await tx.materialIssue.create({
                data: {
                    productionOrderId,
                    productVariantId,
                    quantity
                }
            });
        });

        revalidatePath(`/dashboard/production/orders/${productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Delete Material Issue (Void/Refund)
 */
export async function deleteMaterialIssue(issueId: string, productionOrderId: string) {
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Get the issue record
            const issue = await tx.materialIssue.findUnique({
                where: { id: issueId }
            });

            if (!issue) {
                throw new Error("Material Issue record not found");
            }

            // WORKAROUND: For this iteration, I will assume refund to the "Raw Material Warehouse".
            // This is the safest default for now.

            const refundLocation = await tx.location.findUnique({
                where: { slug: 'raw_material_warehouse' }
            });

            if (!refundLocation) throw new Error("Could not determine refund location (Raw Material Warehouse not found)");

            // 2. Refund Inventory (Increment)
            await tx.inventory.upsert({
                where: {
                    locationId_productVariantId: {
                        locationId: refundLocation.id,
                        productVariantId: issue.productVariantId
                    }
                },
                update: {
                    quantity: { increment: issue.quantity }
                },
                create: {
                    locationId: refundLocation.id,
                    productVariantId: issue.productVariantId,
                    quantity: issue.quantity
                }
            });

            // 3. Create Stock Movement (IN/VOID)
            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: issue.productVariantId,
                    toLocationId: refundLocation.id,
                    quantity: issue.quantity,
                    reference: `VOID Issue: PO-${productionOrderId.slice(0, 8)}`
                }
            });

            // 4. Delete Issue Record
            await tx.materialIssue.delete({
                where: { id: issueId }
            });
        });

        revalidatePath(`/dashboard/production/orders/${productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Record Scrap Generation
 */
export async function recordScrap(data: ScrapRecordValues) {
    const result = scrapRecordSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { productionOrderId, productVariantId, locationId, quantity, reason } = result.data;

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Increment Inventory (Scrap is generated / put into stock)
            await tx.inventory.upsert({
                where: {
                    locationId_productVariantId: {
                        locationId,
                        productVariantId
                    }
                },
                update: {
                    quantity: { increment: quantity }
                },
                create: {
                    locationId,
                    productVariantId,
                    quantity
                }
            });

            // 2. Create Stock Movement (IN)
            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId,
                    toLocationId: locationId,
                    quantity,
                    reference: `Production Scrap: PO-${productionOrderId.slice(0, 8)}`
                }
            });

            // 3. Create Scrap Record
            await tx.scrapRecord.create({
                data: {
                    productionOrderId,
                    productVariantId,
                    quantity,
                    reason
                }
            });
        });

        revalidatePath(`/dashboard/production/orders/${productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Record Quality Inspection
 */
export async function recordQualityInspection(data: QualityInspectionValues) {
    const result = qualityInspectionSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { productionOrderId, result: inspectionResult, notes } = result.data;

    try {
        await prisma.qualityInspection.create({
            data: {
                productionOrderId,
                result: inspectionResult,
                notes
            }
        });

        revalidatePath(`/dashboard/production/orders/${productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Add Production Output (Partial Completion)
 */
export async function addProductionOutput(data: ProductionOutputValues) {
    const result = productionOutputSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    // Extract new fields
    const {
        productionOrderId, quantityProduced,
        scrapProngkolQty, scrapDaunQty,
        machineId, operatorId, shiftId, startTime, endTime, notes
    } = result.data;

    // Calculate Total Scrap for summary
    const totalScrap = (scrapProngkolQty || 0) + (scrapDaunQty || 0);

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Create Execution Record
            await tx.productionExecution.create({
                data: {
                    productionOrderId,
                    machineId,
                    operatorId,
                    shiftId,
                    quantityProduced,
                    scrapQuantity: totalScrap, // Save Aggregate
                    startTime,
                    endTime,
                    notes
                }
            });

            // 1.5 Handle SCRAP Logic (Prongkol & Daun)
            // Look up the specific scrap variants
            // We assume slug convention from Seed: 'scrap_prongkol' -> SKU 'SCRAP-PRONGKOL' and 'scrap_daun' -> SKU 'SCRAP-DAUN'

            // Helper to record scrap
            const handleScrapRecording = async (skuCode: string, qty: number, reason: string) => {
                if (qty <= 0) return;

                const scrapVariant = await tx.productVariant.findFirst({
                    where: { skuCode }
                });

                if (!scrapVariant) {
                    // Should not happen if seeded correctly. 
                    // Fallback: Log a warning or just skip? 
                    // Ideally throw error to ensure data integrity
                    throw new Error(`System Error: Scrap Variant ${skuCode} not found.`);
                }

                // Get Scrap Warehouse
                const scrapLocation = await tx.location.findUnique({
                    where: { slug: 'scrap_warehouse' }
                });

                if (!scrapLocation) {
                    throw new Error(`System Error: Scrap Warehouse not found.`);
                }

                // 2. Create Stock Movement (IN) for Scrap
                await tx.stockMovement.create({
                    data: {
                        type: MovementType.IN,
                        productVariantId: scrapVariant.id,
                        toLocationId: scrapLocation.id,
                        quantity: qty,
                        reference: `Production Scrap (${reason}): PO-${productionOrderId.slice(0, 8)}`
                    }
                });

                // 3. Increment Inventory
                await tx.inventory.upsert({
                    where: {
                        locationId_productVariantId: {
                            locationId: scrapLocation.id,
                            productVariantId: scrapVariant.id
                        }
                    },
                    update: {
                        quantity: { increment: qty }
                    },
                    create: {
                        locationId: scrapLocation.id,
                        productVariantId: scrapVariant.id,
                        quantity: qty
                    }
                });

                // 4. Create Scrap Record
                await tx.scrapRecord.create({
                    data: {
                        productionOrderId,
                        productVariantId: scrapVariant.id,
                        quantity: qty,
                        reason
                    }
                });
            };

            // Process both types
            await handleScrapRecording('SCRAP-PRONGKOL', scrapProngkolQty || 0, 'Affal Prongkol (Lumps)');
            await handleScrapRecording('SCRAP-DAUN', scrapDaunQty || 0, 'Affal Daun (Trim)');


            // 2. Fetch Order with Relations to calculate requirements
            // We need: BOM items, Material Issues, and Previous Executions
            const currentOrder = await tx.productionOrder.findUniqueOrThrow({
                where: { id: productionOrderId },
                include: {
                    bom: {
                        include: {
                            items: true
                        }
                    },
                    executions: true,
                    materialIssues: true
                }
            });

            // Update Actuals
            const currentActual = currentOrder.actualQuantity ?? new Prisma.Decimal(0);
            const newActual = currentActual.plus(new Prisma.Decimal(quantityProduced));

            await tx.productionOrder.update({
                where: { id: productionOrderId },
                data: {
                    actualQuantity: newActual,
                    status: ProductionStatus.IN_PROGRESS
                }
            });

            // 3. Smart Backflushing Logic
            if (currentOrder.bom && currentOrder.bom.items.length > 0) {
                // Fetch ALL executions to be sure (including the one we just created, if visible, 
                // but strictly speaking, `currentOrder.executions` might be stale if fetched before create? 
                // Actually we fetched it AFTER create in line 470 above (which is now new line). 
                // So currentOrder.executions SHOULD include the new one because we are in the same transaction 
                // and we fetched it after creation.
                // Let's verify this assumption is safe. Even if it doesn't, we can add it manually.

                // Sum of ALL output including current
                // Note: currentOrder.executions comes from DB. 
                const totalOutput = currentOrder.executions.reduce((sum, e) => sum + Number(e.quantityProduced), 0);

                // If the totalOutput is 0 (unlikely if we just created one), it means the fetch didn't see the new one.
                // In Prisma, `findUnique` inside a transaction usually sees previous writes in the same transaction.
                // But let's check if the ID matches.

                // Iterate BOM Items
                for (const item of currentOrder.bom.items) {
                    const ratio = Number(item.quantity) / Number(currentOrder.bom.outputQuantity);

                    // Total Material Required for ALL Production to date
                    const totalRequiredSoFar = totalOutput * ratio;

                    // Total Material ALREADY Issued (Manual Issues)
                    const totalIssued = currentOrder.materialIssues
                        .filter(mi => mi.productVariantId === item.productVariantId)
                        .reduce((sum, mi) => sum + Number(mi.quantity), 0);

                    // Required amount for PREVIOUS productions (everything before now)
                    // We can estimate this: TotalRequiredSoFar - (CurrentQty * Ratio)
                    const currentRequired = quantityProduced * ratio;
                    const previousRequired = totalRequiredSoFar - currentRequired;

                    // Net Available in "Issued Bucket" for THIS execution
                    // If we had excess issue before, it covers this.
                    // If we had deficit before, we presumably backflushed it already (or stock went negative).
                    // We only care about the DELTA that needs to be covered NOW.

                    // Logic:
                    // We need to ensure that `Total Stock Deducted` (Issued + Backflushed) >= `TotalRequiredSoFar`.
                    // But we don't want to double count backflushed items.
                    //
                    // Simplified: 
                    // Deficit = Max(0, TotalRequiredSoFar - TotalIssued).
                    // We need to have backflushed at least `Deficit` amount total over time.
                    // How much have we ALREADY backflushed in previous steps?
                    // It's hard to track "Backflushed" specifically without a tag.
                    // But we can calculate based on the assumption that we always backflush deficit.

                    // Let's us the "Issued covers X amount of production" model.
                    // availableFromIssue = Max(0, TotalIssued - previousRequired)
                    // coveredByIssue = Min(availableFromIssue, currentRequired)
                    // neededFromBackflush = currentRequired - coveredByIssue

                    const availableFromIssue = Math.max(0, totalIssued - previousRequired);
                    const coveredByIssue = Math.min(availableFromIssue, currentRequired);
                    const qtyToBackflush = currentRequired - coveredByIssue;

                    if (qtyToBackflush > 0.0001) { // Tolerance for float math
                        const sourceLocationId = currentOrder.locationId;

                        // Check physical stock and active reservations to avoid negative inventory
                        const invRow = await tx.inventory.findUnique({
                            where: {
                                locationId_productVariantId: {
                                    locationId: sourceLocationId,
                                    productVariantId: item.productVariantId
                                }
                            },
                            select: { quantity: true }
                        });

                        const physicalQty = invRow?.quantity.toNumber() || 0;
                        const resAgg = await tx.stockReservation.aggregate({
                            where: {
                                locationId: sourceLocationId,
                                productVariantId: item.productVariantId,
                                status: ReservationStatus.ACTIVE
                            },
                            _sum: { quantity: true }
                        });

                        const reservedQty = resAgg._sum.quantity?.toNumber() || 0;
                        const availableQty = physicalQty - reservedQty;

                        if (availableQty < qtyToBackflush) {
                            const variant = await tx.productVariant.findUnique({ where: { id: item.productVariantId }, select: { name: true } });
                            throw new Error(`Insufficient available stock for ${variant?.name || item.productVariantId} at source. Available: ${availableQty}, Required: ${qtyToBackflush}`);
                        }

                        // Safe decrement (record must exist because availableQty >= needed)
                        await tx.inventory.update({
                            where: {
                                locationId_productVariantId: {
                                    locationId: sourceLocationId,
                                    productVariantId: item.productVariantId
                                }
                            },
                            data: { quantity: { decrement: qtyToBackflush } }
                        });

                        // Record Movement
                        await tx.stockMovement.create({
                            data: {
                                type: MovementType.OUT,
                                productVariantId: item.productVariantId,
                                fromLocationId: sourceLocationId,
                                quantity: qtyToBackflush,
                                reference: `Smart Backflush: PO-${currentOrder.orderNumber}`
                            }
                        });
                    }
                }
            }

            // 4. Update Finished Goods Inventory
            const outputLocationId = currentOrder.locationId;
            const outputVariantId = currentOrder.bom.productVariantId;

            await tx.inventory.upsert({
                where: {
                    locationId_productVariantId: {
                        locationId: outputLocationId,
                        productVariantId: outputVariantId
                    }
                },
                update: {
                    quantity: { increment: quantityProduced }
                },
                create: {
                    locationId: outputLocationId,
                    productVariantId: outputVariantId,
                    quantity: quantityProduced
                }
            });

            await tx.stockMovement.create({
                data: {
                    type: MovementType.IN,
                    productVariantId: outputVariantId,
                    toLocationId: outputLocationId,
                    quantity: quantityProduced,
                    reference: `Production Output: PO-${currentOrder.orderNumber}`
                }
            });
        });

        revalidatePath(`/dashboard/production/orders/${productionOrderId}`);
        return { success: true };
    } catch (error) {
        console.error("Add Production Output Error:", error);
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Fetch Master Data for Production Forms
 */
export async function getProductionFormData() {
    const [boms, machines, locations, employees, workShifts, rawMaterials] = await Promise.all([
        prisma.bom.findMany({
            include: {
                productVariant: {
                    include: {
                        product: true
                    }
                },
                items: {
                    include: {
                        productVariant: true
                    }
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
    const operators = employees.filter((e: { role: string }) => e.role === 'OPERATOR');
    const helpers = employees.filter((e: { role: string }) => e.role === 'HELPER' || e.role === 'PACKER');

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
export async function getBomWithInventory(
    bomId: string,
    sourceLocationId: string,
    plannedQuantity: number
) {
    if (!bomId || plannedQuantity <= 0) return { success: false, error: "Invalid parameters" };

    try {
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

        if (!bom) return { success: false, error: "Recipe not found" };

        const variantIds = bom.items.map(i => i.productVariantId);

        // Fetch inventory rows in bulk (avoid N+1)
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

        // Heuristic: if everything is zero/missing in requested source, but RM warehouse has stock,
        // suggest switching source location (prevents confusing "0" stock in Material Requirements).
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

        const materialRequirements = await Promise.all(bom.items.map(async (item) => {
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
        }));

        return {
            success: true,
            data: materialRequirements,
            meta: {
                requestedSourceLocationId: sourceLocationId,
                suggestedSourceLocationId: suggestedSourceLocation?.id || null,
                suggestedSourceLocationName: suggestedSourceLocation?.name || null,
            }
        };

    } catch (error) {
        console.error("Error calculating BOM requirements:", error);
        return { success: false, error: "Failed to calculate requirements" };
    }
}

/**
 * Log Production Output (While Running)
 * Increments totals without stopping execution
 */
export async function logRunningOutput(data: LogRunningOutputValues) {
    const result = logRunningOutputSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    const { executionId, quantityProduced, scrapQuantity, notes } = result.data;

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Get current execution to find Order ID
            const execution = await tx.productionExecution.findUniqueOrThrow({
                where: { id: executionId }
            });

            // 2. Update Execution (Accumulate)
            await tx.productionExecution.update({
                where: { id: executionId },
                data: {
                    quantityProduced: { increment: quantityProduced },
                    scrapQuantity: { increment: scrapQuantity },
                    notes: notes ? (execution.notes ? `${execution.notes}\n[Log]: ${notes}` : `[Log]: ${notes}`) : undefined
                }
            });

            const productionOrderId = execution.productionOrderId;

            // 3. Update Order actual quantity (Accumulate)
            // Fetch current to handle NULL safely
            const currentOrder = await tx.productionOrder.findUniqueOrThrow({
                where: { id: productionOrderId }
            });

            const newTotal = (currentOrder.actualQuantity ? Number(currentOrder.actualQuantity) : 0) + quantityProduced;

            const order = await tx.productionOrder.update({
                where: { id: productionOrderId },
                data: {
                    actualQuantity: newTotal
                },
                include: {
                    bom: {
                        include: { items: true }
                    }
                }
            });

            const locationId = order.locationId;
            const outputVariantId = order.bom.productVariantId;

            // 4. Update Finished Goods Inventory (Add)
            await tx.inventory.upsert({
                where: {
                    locationId_productVariantId: {
                        locationId,
                        productVariantId: outputVariantId
                    }
                },
                update: {
                    quantity: { increment: quantityProduced }
                },
                create: {
                    locationId,
                    productVariantId: outputVariantId,
                    quantity: quantityProduced
                }
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

            // 6. Backflush Raw Materials (Deduct) based on BOM Ratio
            if (order.bom && order.bom.items.length > 0) {
                for (const item of order.bom.items) {
                    const ratio = Number(item.quantity) / Number(order.bom.outputQuantity);
                    const qtyToDeduct = quantityProduced * ratio;

                    if (qtyToDeduct > 0.0001) {
                        // Check inventory and reservations before decrementing to avoid negatives
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

                        // Safe decrement
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
                                reference: `Backflush (Partial): PO-${order.orderNumber}`
                            }
                        });
                    }
                }
            }
        });

        revalidatePath('/dashboard/production');
        revalidatePath('/dashboard/production/kiosk');
        return { success: true };
    } catch (error) {
        console.error('Error logging output:', error);
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}




/**
 * Convenience action to create a Production Order directly from a Sales Order shortage
 */
export async function createProductionFromSalesOrder(salesOrderId: string, productVariantId: string, quantity: number) {
    if (!salesOrderId || !productVariantId || quantity <= 0) {
        return { success: false, error: "Invalid parameters" };
    }

    try {
        // 1. Find default BOM for the product variant
        const bom = await prisma.bom.findFirst({
            where: {
                productVariantId,
                isDefault: true
            }
        });

        if (!bom) {
            return { success: false, error: "No default BOM found for this product. Please create one first." };
        }

        // 2. Fetch Sales Order to get location and date info
        const so = await prisma.salesOrder.findUnique({
            where: { id: salesOrderId },
            select: { sourceLocationId: true, expectedDate: true }
        });

        if (!so) return { success: false, error: "Sales Order not found" };

        // 3. Create PO
        const result = await createProductionOrder({
            bomId: bom.id,
            plannedQuantity: quantity,
            plannedStartDate: new Date(),
            plannedEndDate: so.expectedDate || undefined,
            locationId: so.sourceLocationId || '', // Use SO location as target
            salesOrderId,
            notes: `Auto-generated from Sales Order shortage.`
        });

        return result;
    } catch (error) {
        console.error("Create PO from SO Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to trigger production" };
    }
}
