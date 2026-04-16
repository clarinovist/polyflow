'use server';

import { withTenant } from "@/lib/core/tenant";
import { auth } from '@/auth';
import { prisma } from '@/lib/core/prisma';
import { logger } from '@/lib/config/logger';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
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
import { serializeData } from '@/lib/utils/utils';
import { ProductionStatus, Prisma, ProductType, BomCategory } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { ProductionService } from '@/services/production/production-service';
import { createProductionOrderWithGeneratedNumber } from '@/services/production/order-number-service';
import { MrpService } from '@/services/production/mrp-service';

export const getInitData = withTenant(
    async function getInitData() {
        return safeAction(async () => {
            try {
                const data = await ProductionService.getInitData();
                return serializeData(data);
            } catch (error) {
                logger.error("Failed to get init data", { error, module: 'ProductionActions' });
                return {
                    boms: [], machines: [], locations: [],
                    operators: [], helpers: [], workShifts: [], rawMaterials: [], customers: []
                };
            }
        });
    }
);

// Alias for backward compatibility
export const getProductionFormData = getInitData;

export const createProductionOrder = withTenant(
    async function createProductionOrder(data: CreateProductionOrderValues) {
        return safeAction(async () => {
            const result = createProductionOrderSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'PLANNING') {
                    throw new BusinessRuleError('Unauthorized: Only Planning can create work orders');
                }

                const order = await ProductionService.createOrder({ ...result.data, userId: session.user.id });

                revalidatePath('/production');
                revalidatePath('/sales');
                return serializeData(order);
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Failed to create production order", { error, module: 'ProductionActions' });
                throw new BusinessRuleError('Failed to create work order. Please verify input and try again.');
            }
        });
    }
);

export const getProductionOrders = withTenant(
    async function getProductionOrders(filters?: { status?: ProductionStatus, machineId?: string, productTypes?: ProductType[], bomCategories?: BomCategory[], demandType?: 'customer' | 'internal' }) {
        const where: Prisma.ProductionOrderWhereInput = {};
        const bomWhere: Prisma.BomWhereInput = {};

        if (filters?.status) {
            where.status = filters.status;
        }
        if (filters?.machineId) {
            where.machineId = filters.machineId;
        }
        if (filters?.productTypes && filters.productTypes.length > 0) {
            bomWhere.productVariant = {
                product: {
                    productType: {
                        in: filters.productTypes
                    }
                }
            };
        }

        if (filters?.bomCategories && filters.bomCategories.length > 0) {
            bomWhere.category = {
                in: filters.bomCategories
            };
        }

        if (filters?.demandType === 'customer') {
            where.OR = [
                { salesOrderId: { not: null } },
                { isMaklon: true, maklonCustomerId: { not: null } }
            ];
        } else if (filters?.demandType === 'internal') {
            where.salesOrderId = null;
            where.isMaklon = false;
        }

        if (Object.keys(bomWhere).length > 0) {
            where.bom = { is: bomWhere };
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
                isMaklon: true,
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
                salesOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        orderType: true,
                        customer: {
                            select: {
                                id: true,
                                name: true,
                            }
                        }
                    }
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
);

export const getProductionOrder = withTenant(
    async function getProductionOrder(id: string) {
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
                },
                maklonCostItems: {
                    orderBy: { createdAt: 'asc' }
                },
                salesOrder: {
                    select: {
                        id: true,
                        orderNumber: true,
                        orderType: true,
                        customer: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                phone: true,
                            }
                        }
                    }
                }
            }
        });

        if (!order) return null;

        return serializeData(order);
    }
);

export const updateProductionOrder = withTenant(
    async function updateProductionOrder(data: UpdateProductionOrderValues) {
        return safeAction(async () => {
            const result = updateProductionOrderSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'PLANNING') {
                    throw new BusinessRuleError('Unauthorized: Only Planning can update work orders');
                }

                await ProductionService.updateOrder(result.data);

                revalidatePath(`/production/orders/${result.data.id}`);
                revalidatePath('/production');
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : 'An unknown error occurred');
            }
        });
    }
);

export const deleteProductionOrder = withTenant(
    async function deleteProductionOrder(id: string) {
        return safeAction(async () => {
            if (!id) throw new BusinessRuleError("Order ID is required");

            try {
                const session = await auth();
                if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'PLANNING') {
                    throw new BusinessRuleError('Unauthorized: Only Planning can delete work orders');
                }

                await ProductionService.deleteOrder(id);

                revalidatePath('/production');
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : 'An unknown error occurred');
            }
        });
    }
);

export const getProductionOrderStats = withTenant(
    async function getProductionOrderStats() {
        const session = await auth();
        if (!session?.user) {
            return {
                totalOrders: 0,
                activeCount: 0,
                draftCount: 0,
                lateCount: 0
            };
        }

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
);

export const addProductionShift = withTenant(
    async function addProductionShift(data: {
        productionOrderId: string,
        shiftName: string,
        startTime: Date,
        endTime: Date,
        operatorId?: string,
        helperIds?: string[],
        machineId?: string
    }) {
        return safeAction(async () => {
            try {
                await ProductionService.addShift(data);
                revalidatePath(`/production/orders/${data.productionOrderId}`);
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : 'An unknown error occurred');
            }
        });
    }
);

export const deleteProductionShift = withTenant(
    async function deleteProductionShift(shiftId: string, orderId: string) {
        return safeAction(async () => {
            try {
                await ProductionService.deleteShift(shiftId);
                revalidatePath(`/production/orders/${orderId}`);
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : 'An unknown error occurred');
            }
        });
    }
);

export const startExecution = withTenant(
    async function startExecution(data: StartExecutionValues) {
        return safeAction(async () => {
            const result = startExecutionSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                const execution = await ProductionService.startExecution(result.data);

                revalidatePath('/production');
                revalidatePath('/production/kiosk');
                return serializeData(execution);
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error('Failed to start execution', { error, module: 'ProductionActions' });
                throw new BusinessRuleError('Failed to start execution. Please ensure the machine is available.');
            }
        });
    }
);

export const stopExecution = withTenant(
    async function stopExecution(data: StopExecutionValues) {
        return safeAction(async () => {
            const result = stopExecutionSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                const execution = await ProductionService.stopExecution({ ...result.data, userId: session.user.id });

                revalidatePath('/production');
                revalidatePath('/production/kiosk');
                return serializeData(execution);
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error('Failed to stop execution', { error, module: 'ProductionActions' });
                throw new BusinessRuleError('Failed to stop execution. Please try again.');
            }
        });
    }
);

export const addProductionOutput = withTenant(
    async function addProductionOutput(data: ProductionOutputValues) {
        return safeAction(async () => {
            const result = productionOutputSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                await ProductionService.addProductionOutput({ ...result.data, userId: session?.user?.id });
                revalidatePath('/production');
                revalidatePath(`/production/orders/${result.data.productionOrderId}`);
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : "An unknown error occurred");
            }
        });
    }
);

export const recordQualityInspection = withTenant(
    async function recordQualityInspection(data: QualityInspectionValues) {
        return safeAction(async () => {
            const result = qualityInspectionSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                await ProductionService.recordQualityInspection({ ...result.data, userId: session?.user?.id });
                revalidatePath(`/production/orders/${result.data.productionOrderId}`);
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : "An unknown error occurred");
            }
        });
    }
);

export const getActiveExecutions = withTenant(
    async function getActiveExecutions() {
        return safeAction(async () => {
            try {
                const session = await auth();
                if (!session?.user) return [];

                const executions = await ProductionService.getActiveExecutions();
                return serializeData(executions);
            } catch (error) {
                logger.error("Failed to get active executions", { error, module: 'ProductionActions' });
                return [];
            }
        });
    }
);

export const batchIssueMaterials = withTenant(
    async function batchIssueMaterials(data: BatchMaterialIssueValues) {
        return safeAction(async () => {
            const result = batchMaterialIssueSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                await ProductionService.batchIssueMaterials({ ...result.data, userId: session?.user?.id });

                revalidatePath(`/production/orders/${result.data.productionOrderId}`);
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Failed to batch issue materials", { error, module: 'ProductionActions' });
                throw new BusinessRuleError('Failed to issue materials. Please try again.');
            }
        });
    }
);

export const recordMaterialIssue = withTenant(
    async function recordMaterialIssue(data: MaterialIssueValues) {
        return safeAction(async () => {
            const result = materialIssueSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                await ProductionService.recordMaterialIssue({ ...result.data, userId: session?.user?.id });

                revalidatePath(`/production/orders/${result.data.productionOrderId}`);
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : 'An unknown error occurred');
            }
        });
    }
);

export const deleteMaterialIssue = withTenant(
    async function deleteMaterialIssue(issueId: string, productionOrderId: string) {
        return safeAction(async () => {
            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                await ProductionService.deleteMaterialIssue(issueId, productionOrderId);

                revalidatePath(`/production/orders/${productionOrderId}`);
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : 'An unknown error occurred');
            }
        });
    }
);

export const recordScrap = withTenant(
    async function recordScrap(data: ScrapRecordValues) {
        return safeAction(async () => {
            const result = scrapRecordSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                await ProductionService.recordScrap({ ...result.data, userId: session?.user?.id });

                revalidatePath(`/production/orders/${result.data.productionOrderId}`);
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : 'An unknown error occurred');
            }
        });
    }
);

export const deleteScrap = withTenant(
    async function deleteScrap(scrapId: string, productionOrderId: string) {
        return safeAction(async () => {
            const session = await auth();
            if (!session) throw new BusinessRuleError('Unauthorized');

            try {
                await ProductionService.deleteScrap(scrapId, productionOrderId);

                revalidatePath(`/production/orders/${productionOrderId}`);
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : 'An unknown error occurred');
            }
        });
    }
);

export const getBomWithInventory = withTenant(
    async function getBomWithInventory(
        bomId: string,
        sourceLocationId: string,
        plannedQuantity: number
    ) {
        return safeAction(async () => {
            try {
                const result = await ProductionService.getBomWithInventory(bomId, sourceLocationId, plannedQuantity);
                if (!result.ok) {
                    throw new BusinessRuleError(result.error.message);
                }
                return result.value;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Failed to calculate BOM requirements", { error, module: 'ProductionActions' });
                throw new BusinessRuleError("Failed to calculate material requirements. Please try again.");
            }
        });
    }
);

export const logRunningOutput = withTenant(
    async function logRunningOutput(data: LogRunningOutputValues) {
        return safeAction(async () => {
            const result = logRunningOutputSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                await ProductionService.logRunningOutput({ ...result.data, userId: session.user.id });

                revalidatePath('/production');
                revalidatePath('/production/kiosk');
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Failed to log production output", { error, module: 'ProductionActions' });
                throw new BusinessRuleError("Failed to log production output. Please verify input.");
            }
        });
    }
);

export const createProductionFromSalesOrder = withTenant(
    async function createProductionFromSalesOrder(salesOrderId: string, productVariantId?: string, quantity?: number) {
        return safeAction(async () => {
            try {
                const session = await auth();
                if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'PLANNING') {
                    throw new BusinessRuleError('Unauthorized: Only Planning can trigger work orders');
                }

                if (productVariantId && quantity) {
                    const result = await ProductionService.createOrderFromSales(salesOrderId, productVariantId, quantity);
                    revalidatePath('/production');
                    revalidatePath('/sales');
                    return serializeData(result);
                }

                const result = await MrpService.convertSoToPo(salesOrderId, session.user.id);

                revalidatePath('/production');
                revalidatePath('/sales');
                return serializeData(result);
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Failed to create WO from SO", { salesOrderId, error, module: 'ProductionActions' });
                throw new BusinessRuleError("Failed to automatically trigger production order from Sales Order.");
            }
        });
    }
);

export const simulateMrp = withTenant(
    async function simulateMrp(salesOrderId: string) {
        return safeAction(async () => {
            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                const result = await MrpService.simulateMaterialRequirements(salesOrderId);
                return serializeData(result);
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : "Failed to simulate MRP");
            }
        });
    }
);

export const logMachineDowntime = withTenant(
    async function logMachineDowntime(data: LogMachineDowntimeValues) {
        return safeAction(async () => {
            const result = logMachineDowntimeSchema.safeParse(data);
            if (!result.success) {
                throw new BusinessRuleError(result.error.issues[0].message);
            }

            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                await ProductionService.recordDowntime(result.data);
                revalidatePath('/production');
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                throw new BusinessRuleError(error instanceof Error ? error.message : "An unknown error occurred");
            }
        });
    }
);

export const createChildProductionOrder = withTenant(
    async function createChildProductionOrder(
        parentOrderId: string,
        productVariantId: string,
        quantity: number
    ) {
        return safeAction(async () => {
            try {
                const session = await auth();
                if (session?.user?.role !== 'ADMIN' && session?.user?.role !== 'PLANNING') {
                    throw new BusinessRuleError('Unauthorized: Only Planning can create sub-work orders');
                }

                const result = await prisma.$transaction(async (tx) => {
                    const parentOrder = await tx.productionOrder.findUnique({
                        where: { id: parentOrderId },
                        select: { salesOrderId: true, locationId: true, status: true }
                    });

                    if (!parentOrder) throw new Error("Parent order not found");

                    const bom = await tx.bom.findFirst({
                        where: { productVariantId, isDefault: true }
                    });

                    if (!bom) throw new Error("No default BOM found for this item. Please set a Primary Default Recipe first.");

                    const po = await createProductionOrderWithGeneratedNumber(
                        tx,
                        {
                            salesOrder: parentOrder.salesOrderId
                                ? { connect: { id: parentOrder.salesOrderId } }
                                : undefined,
                            bom: { connect: { id: bom.id } },
                            plannedQuantity: quantity,
                            status: 'DRAFT',
                            plannedStartDate: new Date(),
                            location: { connect: { id: parentOrder.locationId } },
                            parentOrder: { connect: { id: parentOrderId } },
                            notes: `Sub-order for ${parentOrder.status} parent`
                        },
                        {
                            prefix: 'SWO',
                            productVariantId,
                        }
                    );

                    const bomItems = await tx.bomItem.findMany({
                        where: { bomId: bom.id }
                    });

                    const outputRatio = quantity / Number(bom.outputQuantity);

                    await tx.productionMaterial.createMany({
                        data: bomItems.map(bi => ({
                            productionOrderId: po.id,
                            productVariantId: bi.productVariantId,
                            quantity: Number(bi.quantity) * outputRatio
                        }))
                    });

                    return po;
                });

                revalidatePath(`/production/orders/${parentOrderId}`);
                revalidatePath('/production');
                return serializeData(result);
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Failed to create child PO", { parentOrderId, error, module: 'ProductionActions' });
                throw new BusinessRuleError("Failed to create sub-order. Please try again.");
            }
        });
    }
);

// ============== ISSUE ACTIONS ==============

export const createProductionIssue = withTenant(
    async function createProductionIssue(data: {
        productionOrderId: string;
        category: 'MACHINE_BREAKDOWN' | 'MATERIAL_DEFECT' | 'QUALITY_ISSUE' | 'OPERATOR_ERROR' | 'OTHER';
        description: string;
    }) {
        return safeAction(async () => {
            try {
                const session = await auth();
                if (!session?.user) throw new BusinessRuleError('Unauthorized');

                const issue = await ProductionService.createIssue({
                    ...data,
                    reportedById: session.user.id
                });

                revalidatePath(`/planning/orders/${data.productionOrderId}`);
                return serializeData(issue);
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Failed to create production issue", { productionOrderId: data.productionOrderId, error, module: 'ProductionActions' });
                throw new BusinessRuleError("Failed to create production issue.");
            }
        });
    }
);

export const updateProductionIssueStatus = withTenant(
    async function updateProductionIssueStatus(
        issueId: string,
        status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED',
        resolvedNotes?: string,
        productionOrderId?: string
    ) {
        return safeAction(async () => {
            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                const issue = await ProductionService.updateIssueStatus(issueId, status, resolvedNotes);

                if (productionOrderId) {
                    revalidatePath(`/planning/orders/${productionOrderId}`);
                }

                return serializeData(issue);
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Failed to update production issue status", { issueId, status, error, module: 'ProductionActions' });
                throw new BusinessRuleError("Failed to update issue status.");
            }
        });
    }
);

export const deleteProductionIssue = withTenant(
    async function deleteProductionIssue(issueId: string, productionOrderId: string) {
        return safeAction(async () => {
            try {
                const session = await auth();
                if (!session?.user) {
                    throw new BusinessRuleError('Unauthorized');
                }

                await ProductionService.deleteIssue(issueId);

                revalidatePath(`/planning/orders/${productionOrderId}`);
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Failed to delete production issue", { issueId, error, module: 'ProductionActions' });
                throw new BusinessRuleError("Failed to delete issue.");
            }
        });
    }
);

export const voidProductionOutput = withTenant(
    async function voidProductionOutput(executionId: string, productionOrderId: string) {
        return safeAction(async () => {
            try {
                const session = await auth();
                if (!session?.user || (session.user.role !== 'ADMIN' && session.user.role !== 'PRODUCTION')) {
                    throw new BusinessRuleError('Unauthorized: Only production leaders or admins can void output');
                }

                await ProductionService.voidExecution(executionId, session.user.id);

                revalidatePath(`/production/orders/${productionOrderId}`);
                revalidatePath('/production/history');
                revalidatePath('/dashboard');
                return null;
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Failed to void production output", { executionId, error, module: 'ProductionActions' });
                throw new BusinessRuleError("Failed to void production output. Please ensure you have sufficient permissions.");
            }
        });
    }
);
