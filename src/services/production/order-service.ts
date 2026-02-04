import { prisma } from '@/lib/prisma';
import {
    CreateProductionOrderValues,
    UpdateProductionOrderValues
} from '@/lib/schemas/production';
import { ProductionStatus, MachineType, BomCategory } from '@prisma/client';

import { WAREHOUSE_SLUGS } from '@/lib/constants/locations';

export class ProductionOrderService {
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
                where: { slug: WAREHOUSE_SLUGS.RAW_MATERIAL },
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
    static async createOrder(data: CreateProductionOrderValues & { userId?: string }) {
        const {
            bomId, plannedQuantity, plannedStartDate, plannedEndDate,
            locationId, orderNumber, notes, salesOrderId, userId, machineId
        } = data;

        return await prisma.$transaction(async (tx) => {
            // 1. Validate Machine Type against BOM Category if machineId is provided
            if (machineId) {
                const [machine, bom] = await Promise.all([
                    tx.machine.findUnique({ where: { id: machineId }, select: { type: true } }),
                    tx.bom.findUnique({ where: { id: bomId }, select: { category: true } })
                ]);

                if (machine && bom) {
                    const isTypeMatch = (
                        (bom.category === BomCategory.MIXING && machine.type === MachineType.MIXER) ||
                        (bom.category === BomCategory.EXTRUSION && (machine.type === MachineType.EXTRUDER || machine.type === MachineType.REWINDER)) ||
                        (bom.category === BomCategory.PACKING && (machine.type === MachineType.PACKER || machine.type === MachineType.GRANULATOR)) ||
                        (bom.category === BomCategory.STANDARD && (machine.type === MachineType.EXTRUDER || machine.type === MachineType.MIXER)) // Standard fallback
                    );

                    if (!isTypeMatch) {
                        throw new Error(`Machine type ${machine.type} is not compatible with stage ${bom.category}`);
                    }
                }
            }
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

            // 3. Determine Initial Status based on Stock Availability
            let initialStatus: ProductionStatus = ProductionStatus.DRAFT;
            if (materialsToCreate.length > 0) {
                const variantIds = materialsToCreate.map(m => m.productVariantId);
                const inventoryRows = await tx.inventory.findMany({
                    where: {
                        locationId: locationId,
                        productVariantId: { in: variantIds }
                    }
                });

                const isShortage = materialsToCreate.some(m => {
                    const stock = inventoryRows.find(ir => ir.productVariantId === m.productVariantId)?.quantity.toNumber() || 0;
                    return m.quantity > stock;
                });

                if (isShortage) {
                    initialStatus = ProductionStatus.WAITING_MATERIAL;
                }
            }

            // 4. Create Order
            const newOrder = await tx.productionOrder.create({
                data: {
                    orderNumber: orderNumber || `WO-${Date.now()}`,
                    bomId,
                    plannedQuantity,
                    plannedStartDate,
                    plannedEndDate,
                    locationId,
                    notes,
                    status: initialStatus,
                    actualQuantity: 0,
                    salesOrderId: salesOrderId || null,
                    createdById: userId,
                    machineId: machineId || null
                }
            });

            // 5. Create Material Requirements
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

        if (order.status !== 'DRAFT' && order.status !== 'WAITING_MATERIAL') {
            throw new Error("Only DRAFT or WAITING_MATERIAL orders can be deleted.");
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
}
