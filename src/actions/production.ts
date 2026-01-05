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
    QualityInspectionValues
} from '@/lib/zod-schemas';
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
        machineId, locationId, orderNumber, initialShift
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
                    machineId,
                    locationId,
                    status: ProductionStatus.DRAFT,
                }
            });

            // 2. Create Initial Shift (if provided)
            if (initialShift) {
                // Combine date from plannedStartDate with time from shift
                const startDateTime = new Date(plannedStartDate);
                const [startH, startM] = initialShift.startTime.split(':').map(Number);
                startDateTime.setHours(startH, startM, 0);

                const endDateTime = new Date(plannedStartDate);
                const [endH, endM] = initialShift.endTime.split(':').map(Number);
                endDateTime.setHours(endH, endM, 0);

                // Handle overnight shift
                if (endDateTime < startDateTime) {
                    endDateTime.setDate(endDateTime.getDate() + 1);
                }

                await tx.productionShift.create({
                    data: {
                        productionOrderId: newOrder.id,
                        shiftName: initialShift.shiftName,
                        startTime: startDateTime,
                        endTime: endDateTime,
                        operatorId: initialShift.operatorId,
                        helpers: initialShift.helperIds ? {
                            connect: initialShift.helperIds.map((id) => ({ id }))
                        } : undefined
                    }
                });
            }

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
            }
        }
    });

    if (!order) return null;

    // Serialize Decimals
    const orderAny = order as any;
    return {
        ...orderAny,
        plannedQuantity: orderAny.plannedQuantity.toNumber(),
        actualQuantity: orderAny.actualQuantity?.toNumber() ?? null,
        bom: {
            ...orderAny.bom,
            outputQuantity: orderAny.bom.outputQuantity.toNumber(),
            items: orderAny.bom.items.map((item: any) => ({
                ...item,
                quantity: item.quantity.toNumber(),
                scrapPercentage: item.scrapPercentage?.toNumber() ?? null
            }))
        },
        materialIssues: orderAny.materialIssues.map((issue: any) => ({
            ...issue,
            quantity: issue.quantity.toNumber()
        })),
        scrapRecords: orderAny.scrapRecords.map((record: any) => ({
            ...record,
            quantity: record.quantity.toNumber()
        }))
    } as any;
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
 * Fetch Master Data for Production Forms
 */
export async function getProductionFormData() {
    const [boms, machines, locations, employees] = await Promise.all([
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
        helpers
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

