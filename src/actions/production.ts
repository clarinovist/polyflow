'use server';

import { auth } from '@/auth';
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
    QualityInspectionValues,
    logMachineDowntimeSchema,
    LogMachineDowntimeValues
} from '@/lib/schemas/production';
import { serializeData } from '@/lib/utils';
import { ProductionStatus, Prisma, ProductType } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { ProductionService } from '@/services/production-service';
import { MrpService } from '@/services/mrp-service';

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
        const session = await auth();
        if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'PLANNING') {
            return { success: false, error: 'Unauthorized: Only Planning can create work orders' };
        }

        const order = await ProductionService.createOrder({ ...result.data, userId: session.user.id });

        revalidatePath('/production');
        revalidatePath('/sales');
        return { success: true, data: serializeData(order) };
    } catch (error) {
        console.error("Create Production Order Error:", error);
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Get Production Orders with filters and pagination
 */
export async function getProductionOrders(filters?: { status?: ProductionStatus, machineId?: string, productTypes?: ProductType[] }) {
    const where: Prisma.ProductionOrderWhereInput = {};

    if (filters?.status) {
        where.status = filters.status;
    }
    if (filters?.machineId) {
        where.machineId = filters.machineId;
    }
    if (filters?.productTypes && filters.productTypes.length > 0) {
        where.bom = {
            productVariant: {
                product: {
                    productType: {
                        in: filters.productTypes
                    }
                }
            }
        };
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
                            product: true
                        }
                    }
                }
            },
            childOrders: {
                include: {
                    bom: {
                        include: {
                            productVariant: { select: { id: true, name: true } }
                        }
                    }
                }
            },
            parentOrder: true,
            issues: {
                include: {
                    reportedBy: { select: { id: true, name: true } }
                },
                orderBy: { reportedAt: 'desc' }
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
        const session = await auth();
        if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'PLANNING') {
            return { success: false, error: 'Unauthorized: Only Planning can update work orders' };
        }

        await ProductionService.updateOrder(result.data);

        revalidatePath(`/production/orders/${result.data.id}`);
        revalidatePath('/production');
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
        const session = await auth();
        if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'PLANNING') {
            return { success: false, error: 'Unauthorized: Only Planning can delete work orders' };
        }

        await ProductionService.deleteOrder(id);

        revalidatePath('/production');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Get Production Order Statistics
 */
export async function getProductionOrderStats() {
    await auth();

    const stats = await prisma.productionOrder.groupBy({
        by: ['status'],
        _count: {
            status: true
        }
    });

    const totalOrders = stats.reduce((acc, curr) => acc + curr._count.status, 0);

    const activeCount = stats
        .filter(s => s.status === 'IN_PROGRESS')
        .reduce((acc, curr) => acc + curr._count.status, 0);

    const draftCount = stats
        .filter(s => ['DRAFT', 'RELEASED', 'WAITING_MATERIAL'].includes(s.status))
        .reduce((acc, curr) => acc + curr._count.status, 0);

    // Calculate late orders (this needs a separate query as it depends on endDate)
    const lateCount = await prisma.productionOrder.count({
        where: {
            status: { in: ['RELEASED', 'IN_PROGRESS'] },
            plannedEndDate: {
                lt: new Date()
            }
        }
    });

    return {
        totalOrders,
        activeCount,
        draftCount,
        lateCount
    };
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
        revalidatePath(`/production/orders/${data.productionOrderId}`);
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
        revalidatePath(`/production/orders/${orderId}`);
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

        revalidatePath('/production');
        revalidatePath('/production/kiosk');
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

        revalidatePath('/production');
        revalidatePath('/production/kiosk');
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
        const session = await auth();
        await ProductionService.addProductionOutput({ ...result.data, userId: session?.user?.id });
        revalidatePath('/production');
        // Revalidate detail page of order
        revalidatePath(`/production/orders/${result.data.productionOrderId}`);
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
        const session = await auth();
        await ProductionService.recordQualityInspection({ ...result.data, userId: session?.user?.id });
        revalidatePath(`/production/orders/${result.data.productionOrderId}`);
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
        const session = await auth();
        await ProductionService.batchIssueMaterials({ ...result.data, userId: session?.user?.id });

        revalidatePath(`/production/orders/${result.data.productionOrderId}`);
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
        const session = await auth();
        await ProductionService.recordMaterialIssue({ ...result.data, userId: session?.user?.id });

        revalidatePath(`/production/orders/${result.data.productionOrderId}`);
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

        revalidatePath(`/production/orders/${productionOrderId}`);
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
        const session = await auth();
        await ProductionService.recordScrap({ ...result.data, userId: session?.user?.id });

        revalidatePath(`/production/orders/${result.data.productionOrderId}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'An unknown error occurred' };
    }
}

/**
 * Delete Scrap Record
 */
export async function deleteScrap(scrapId: string, productionOrderId: string) {
    const session = await auth();
    if (!session) return { success: false, error: 'Unauthorized' };

    try {
        await ProductionService.deleteScrap(scrapId, productionOrderId);

        revalidatePath(`/production/orders/${productionOrderId}`);
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

        revalidatePath('/production');
        revalidatePath('/production/kiosk');
        return { success: true };
    } catch (error) {
        console.error('Error logging output:', error);
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

/**
 * Create Production Order from Sales Order (Shortage)
 */
export async function createProductionFromSalesOrder(salesOrderId: string, productVariantId?: string, quantity?: number) {
    try {
        const session = await auth();
        if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'PLANNING') {
            return { success: false, error: 'Unauthorized: Only Planning can trigger work orders' };
        }

        if (productVariantId && quantity) {
            // Create for specific item
            const result = await ProductionService.createOrderFromSales(salesOrderId, productVariantId, quantity);
            revalidatePath('/production');
            revalidatePath('/sales');
            return { success: true, data: serializeData(result) };
        }

        // Default: Run MRP for whole order (if implemented)
        const result = await MrpService.convertSoToPo(salesOrderId, session.user.id);

        revalidatePath('/production');
        revalidatePath('/sales');
        return serializeData(result);
    } catch (error) {
        console.error("Create WO from SO Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to trigger production" };
    }
}

/**
 * Simulate MRP for a Sales Order
 */
export async function simulateMrp(salesOrderId: string) {
    try {
        const result = await MrpService.simulateMaterialRequirements(salesOrderId);
        return { success: true, data: serializeData(result) };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to simulate MRP" };
    }
}

/**
 * Log Machine Downtime
 */
export async function logMachineDowntime(data: LogMachineDowntimeValues) {
    const result = logMachineDowntimeSchema.safeParse(data);
    if (!result.success) {
        return { success: false, error: result.error.issues[0].message };
    }

    try {
        await ProductionService.recordDowntime(result.data);
        revalidatePath('/production');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "An unknown error occurred" };
    }
}

/**
 * Create Child Production Order (Sub-WO)
 */
export async function createChildProductionOrder(
    parentOrderId: string,
    productVariantId: string,
    quantity: number
) {
    try {
        const session = await auth();
        // Allow PLANNING or ADMIN roles
        if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'PLANNING') {
            return { success: false, error: 'Unauthorized: Only Planning can create sub-work orders' };
        }

        const result = await prisma.$transaction(async (tx) => {
            const parentOrder = await tx.productionOrder.findUnique({
                where: { id: parentOrderId },
                select: { salesOrderId: true, locationId: true, status: true }
            });

            if (!parentOrder) throw new Error("Parent order not found");

            // Look for DEFAULT BOM for this intermediate item
            const bom = await tx.bom.findFirst({
                where: { productVariantId, isDefault: true }
            });

            if (!bom) throw new Error("No default BOM found for this item. Please set a Primary Default Recipe first.");

            // Generate Order Number
            const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
            // Prefix SWO = Sub Work Order
            const orderNumber = `SWO-${productVariantId.slice(0, 4)}-${rand}`;

            const po = await tx.productionOrder.create({
                data: {
                    orderNumber,
                    salesOrderId: parentOrder.salesOrderId,
                    bomId: bom.id,
                    plannedQuantity: quantity,
                    status: 'DRAFT', // Always start as draft
                    plannedStartDate: new Date(), // Plan for today
                    locationId: parentOrder.locationId,
                    parentOrderId: parentOrderId,
                    notes: `Sub-order for ${parentOrder.status} parent`
                }
            });

            // Create Planned Materials for this new Child WO
            const bomItems = await tx.bomItem.findMany({
                where: { bomId: bom.id }
            });

            const outputRatio = quantity / Number(bom.outputQuantity);

            for (const bi of bomItems) {
                await tx.productionMaterial.create({
                    data: {
                        productionOrderId: po.id,
                        productVariantId: bi.productVariantId,
                        quantity: Number(bi.quantity) * outputRatio
                    }
                });
            }

            return po;
        });

        revalidatePath(`/production/orders/${parentOrderId}`);
        revalidatePath('/production'); // Refresh list as well
        return { success: true, data: serializeData(result) };
    } catch (error) {
        console.error("Create Child WO Error:", error);
        return { success: false, error: error instanceof Error ? error.message : "Failed to create sub-order" };
    }
}

// ============== ISSUE ACTIONS ==============

export async function createProductionIssue(data: {
    productionOrderId: string;
    category: 'MACHINE_BREAKDOWN' | 'MATERIAL_DEFECT' | 'QUALITY_ISSUE' | 'OPERATOR_ERROR' | 'OTHER';
    description: string;
}) {
    try {
        const session = await auth();
        // Allow PLANNING, ADMIN, or PRODUCTION (Shift Leader)
        // Adjust role check as needed
        if (!session?.user) return { success: false, error: 'Unauthorized' };

        const issue = await ProductionService.createIssue({
            ...data,
            reportedById: session.user.id
        });

        revalidatePath(`/planning/orders/${data.productionOrderId}`);
        return { success: true, data: serializeData(issue) };
    } catch (error) {
        console.error('[createProductionIssue]', error);
        return { success: false, error: 'Failed to create issue' };
    }
}

export async function updateProductionIssueStatus(
    issueId: string,
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED',
    resolvedNotes?: string,
    productionOrderId?: string
) {
    try {
        const issue = await ProductionService.updateIssueStatus(issueId, status, resolvedNotes);

        if (productionOrderId) {
            revalidatePath(`/planning/orders/${productionOrderId}`);
        }

        return { success: true, data: serializeData(issue) };
    } catch (error) {
        console.error('[updateProductionIssueStatus]', error);
        return { success: false, error: 'Failed to update issue' };
    }
}

export async function deleteProductionIssue(issueId: string, productionOrderId: string) {
    try {
        await ProductionService.deleteIssue(issueId);

        revalidatePath(`/planning/orders/${productionOrderId}`);
        return { success: true };
    } catch (error) {
        console.error('[deleteProductionIssue]', error);
        return { success: false, error: 'Failed to delete issue' };
    }
}
