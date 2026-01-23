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
    batchMaterialIssueSchema,
    BatchMaterialIssueValues,
    startExecutionSchema,
    StartExecutionValues,
    stopExecutionSchema,
    StopExecutionValues,
    logRunningOutputSchema,
    LogRunningOutputValues,
    productionOutputSchema,
    ProductionOutputValues,
    qualityInspectionSchema,
    QualityInspectionValues
} from '@/lib/schemas/production';
import { serializeData } from '@/lib/utils';
import { ProductionStatus, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { ProductionService } from '@/services/production-service';

// Alias for backward compatibility
export const getProductionFormData = getInitData;

/**
 * Get Initialization Data for Forms (Dropdowns, etc.)
 */
export async function getInitData() {
    try {
        const data = await ProductionService.getInitData();
        return serializeData(data);
    } catch (error) {
        console.error("Get Init Data Error:", error);
        return {
            boms: [], machines: [], locations: [],
            operators: [], helpers: [], workShifts: [], rawMaterials: []
        };
    }
}

/**
 * Create a new Production Order
 */
export async function createProductionOrder(data: CreateProductionOrderValues) {
    const result = createProductionOrderSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        const order = await ProductionService.createOrder(result.data);

        revalidatePath('/dashboard/production');
        revalidatePath('/dashboard/sales');
        return { success: true, data: serializeData(order) };
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
        select: {
            id: true,
            orderNumber: true,
            status: true,
            plannedQuantity: true,
            actualQuantity: true,
            plannedStartDate: true,
            plannedEndDate: true,
            actualStartDate: true,
            actualEndDate: true,
            createdAt: true,
            bom: {
                select: {
                    id: true,
                    name: true,
                    productVariant: {
                        select: {
                            id: true,
                            name: true,
                            skuCode: true,
                            primaryUnit: true
                        }
                    }
                }
            },
            machine: {
                select: { id: true, name: true, code: true }
            },
            location: {
                select: { id: true, name: true }
            },
            shifts: {
                select: {
                    id: true,
                    shiftName: true,
                    operator: { select: { name: true } }
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
                            product: { select: { id: true, name: true, productType: true } }
                        }
                    },
                    items: {
                        include: {
                            productVariant: {
                                include: {
                                    product: { select: { id: true, name: true, productType: true } }
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
                    createdBy: { select: { id: true, name: true } }
                }
            },
            scrapRecords: {
                include: {
                    productVariant: true,
                    createdBy: { select: { id: true, name: true } }
                }
            },
            inspections: {
                include: {
                    inspector: { select: { id: true, name: true } }
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
                            product: { select: { id: true, name: true, productType: true } }
                        }
                    }
                }
            }
        }
    });

    if (!order) return null;

    return serializeData(order);
}

/**
 * Update Production Order
 */
export async function updateProductionOrder(data: UpdateProductionOrderValues) {
    const result = updateProductionOrderSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await ProductionService.updateOrder(result.data);

        revalidatePath(`/dashboard/production/orders/${result.data.id}`);
        revalidatePath('/dashboard/production');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Delete Production Order
 */
export async function deleteProductionOrder(id: string) {
    if (!id) return { success: false, error: "Order ID is required" };

    try {
        await ProductionService.deleteOrder(id);

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
        await ProductionService.addShift(data);
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
        await ProductionService.deleteShift(shiftId);
        revalidatePath(`/dashboard/production/orders/${orderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Start Production Execution
 */
export async function startExecution(data: StartExecutionValues) {
    const result = startExecutionSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        const execution = await ProductionService.startExecution(result.data);

        revalidatePath('/dashboard/production');
        revalidatePath('/dashboard/production/kiosk');
        return { success: true, data: serializeData(execution) };
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

    try {
        const execution = await ProductionService.stopExecution(result.data);

        revalidatePath('/dashboard/production');
        revalidatePath('/dashboard/production/kiosk');
        return { success: true, data: serializeData(execution) };
    } catch (error) {
        console.error('Error stopping execution:', error);
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

/**
 * Record Batch Production Output
 */
export async function addProductionOutput(data: ProductionOutputValues) {
    const result = productionOutputSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await ProductionService.addProductionOutput(result.data);
        revalidatePath('/dashboard/production');
        // Revalidate detail page of order
        revalidatePath(`/dashboard/production/orders/${result.data.productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
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

    try {
        await ProductionService.recordQualityInspection(result.data);
        revalidatePath(`/dashboard/production/orders/${result.data.productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

/**
 * Get Active Production Executions
 */
export async function getActiveExecutions() {
    try {
        const executions = await ProductionService.getActiveExecutions();
        return serializeData(executions);
    } catch (error) {
        console.error("Get Active Executions Error:", error);
        return [];
    }
}

/**
 * Batch Record Material Issue
 */
export async function batchIssueMaterials(data: BatchMaterialIssueValues) {
    const result = batchMaterialIssueSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await ProductionService.batchIssueMaterials(result.data);

        revalidatePath(`/dashboard/production/orders/${result.data.productionOrderId}`);
        return { success: true };
    } catch (error) {
        console.error("Batch Issue Error:", error);
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Record Material Issue
 */
export async function recordMaterialIssue(data: MaterialIssueValues) {
    const result = materialIssueSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await ProductionService.recordMaterialIssue(result.data);

        revalidatePath(`/dashboard/production/orders/${result.data.productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Delete Material Issue
 */
export async function deleteMaterialIssue(issueId: string, productionOrderId: string) {
    try {
        await ProductionService.deleteMaterialIssue(issueId, productionOrderId);

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

    try {
        await ProductionService.recordScrap(result.data);

        revalidatePath(`/dashboard/production/orders/${result.data.productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Calculate BOM Requirements with Stock Check
 */
export async function getBomWithInventory(
    bomId: string,
    sourceLocationId: string,
    plannedQuantity: number
) {
    try {
        const result = await ProductionService.getBomWithInventory(bomId, sourceLocationId, plannedQuantity);
        return { success: true, ...result };
    } catch (error) {
        console.error("Error calculating BOM requirements:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to calculate requirements" };
    }
}

/**
 * Log Production Output (While Running)
 */
export async function logRunningOutput(data: LogRunningOutputValues) {
    const result = logRunningOutputSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await ProductionService.logRunningOutput(result.data);

        revalidatePath('/dashboard/production');
        revalidatePath('/dashboard/production/kiosk');
        return { success: true };
    } catch (error) {
        console.error('Error logging output:', error);
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

/**
 * Create Production Order from Sales Order (Shortage)
 */
export async function createProductionFromSalesOrder(salesOrderId: string, productVariantId: string, quantity: number) {
    try {
        const result = await ProductionService.createOrderFromSales(salesOrderId, productVariantId, quantity);

        revalidatePath('/dashboard/production');
        revalidatePath('/dashboard/sales');
        return { success: true, data: serializeData(result) };
    } catch (error) {
        console.error("Create PO from SO Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to trigger production" };
    }
}
