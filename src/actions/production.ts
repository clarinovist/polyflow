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
    productionOutputSchema, // Added
    ProductionOutputValues  // Added
} from '@/lib/zod-schemas';
import { serializeData } from '@/lib/utils';
import { ProductionStatus, Prisma, MovementType } from '@prisma/client';
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
        locationId, orderNumber
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
                    status: ProductionStatus.DRAFT,
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
        return { success: true, data: order };
    } catch (error: any) {
        console.error("Create Production Order Error:", error);
        return { success: false, error: error.message };
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

    // Helper to serialize decimals
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
    } catch (error: any) {
        return { success: false, error: error.message };
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
    helperIds?: string[]
}) {
    try {
        await (prisma as any).productionShift.create({
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
        revalidatePath(`/dashboard/production/orders/${data.productionOrderId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Delete Production Shift
 */
export async function deleteProductionShift(shiftId: string, orderId: string) {
    try {
        await (prisma as any).productionShift.delete({
            where: { id: shiftId }
        });
        revalidatePath(`/dashboard/production/orders/${orderId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
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
                throw new Error(`Insufficient stock in selected location. Available: ${stock?.quantity || 0}`);
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
    } catch (error: any) {
        return { success: false, error: error.message };
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
    } catch (error: any) {
        return { success: false, error: error.message };
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
    } catch (error: any) {
        return { success: false, error: error.message };
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

    const {
        productionOrderId, quantityProduced, scrapQuantity,
        machineId, operatorId, shiftId, startTime, endTime, notes
    } = result.data;

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
                    scrapQuantity,
                    startTime,
                    endTime,
                    notes
                }
            });

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

                        // Decrement Inventory
                        await tx.inventory.upsert({
                            where: {
                                locationId_productVariantId: {
                                    locationId: sourceLocationId,
                                    productVariantId: item.productVariantId
                                }
                            },
                            update: {
                                quantity: { decrement: qtyToBackflush }
                            },
                            create: {
                                locationId: sourceLocationId,
                                productVariantId: item.productVariantId,
                                quantity: -qtyToBackflush
                            }
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
    } catch (error: any) {
        console.error("Add Production Output Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Fetch Master Data for Production Forms
 */
export async function getProductionFormData() {
    const [boms, machines, locations, employees, workShifts] = await Promise.all([
        prisma.bom.findMany({
            include: {
                productVariant: true,
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
        (prisma as any).employee.findMany({
            orderBy: { name: 'asc' }
        }),
        (prisma as any).workShift.findMany({
            where: { status: 'ACTIVE' },
            orderBy: { startTime: 'asc' }
        })
    ]);

    // Filter employees by role
    const operators = employees.filter((e: any) => e.role === 'OPERATOR');
    const helpers = employees.filter((e: any) => e.role === 'HELPER' || e.role === 'PACKER');

    return {
        boms,
        machines,
        locations,
        operators,
        helpers,
        workShifts
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

        const materialRequirements = await Promise.all(bom.items.map(async (item) => {
            const requiredQty = (Number(item.quantity) / Number(bom.outputQuantity)) * plannedQuantity;

            // Get Stock at Source Location
            let currentStock = 0;
            if (sourceLocationId) {
                const inventory = await prisma.inventory.findUnique({
                    where: {
                        locationId_productVariantId: {
                            locationId: sourceLocationId,
                            productVariantId: item.productVariantId
                        }
                    }
                });
                currentStock = inventory?.quantity.toNumber() || 0;
            }

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

        return { success: true, data: materialRequirements };

    } catch (error) {
        console.error("Error calculating BOM requirements:", error);
        return { success: false, error: "Failed to calculate requirements" };
    }
}

