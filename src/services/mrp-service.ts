import { prisma } from '@/lib/prisma';
import { ProductionStatus } from '@prisma/client';


export interface MaterialRequirement {
    materialName: string;
    productVariantId: string;
    neededQty: number;
    availableQty: number;
    shortageQty: number;
    unit: string;
}

export interface MrpSimulationResult {
    salesOrderId: string;
    requirements: MaterialRequirement[];
    canProduce: boolean;
}

export class MrpService {

    /**
     * Simulate Material Requirements for a Sales Order.
     * Explodes BOMs for all items and aggregates raw material needs.
     */
    static async simulateMaterialRequirements(salesOrderId: string): Promise<MrpSimulationResult> {
        // 1. Fetch Sales Order Items
        const so = await prisma.salesOrder.findUnique({
            where: { id: salesOrderId },
            include: {
                items: {
                    include: {
                        productVariant: true
                    }
                }
            }
        });

        if (!so) throw new Error("Sales Order not found");

        const requirementsMap = new Map<string, {
            name: string;
            needed: number;
            unit: string;
        }>();

        // 2. Iterate and Explode BOMs
        for (const item of so.items) {
            // Find default BOM for this product variant
            const bom = await prisma.bom.findFirst({
                where: {
                    productVariantId: item.productVariantId,
                    isDefault: true
                },
                include: { items: { include: { productVariant: true } } }
            });

            if (!bom) {
                // If no BOM, we can't calculate raw materials. 
                // In real world, maybe skip or warn. Here we'll skip but log?
                // Or maybe the item IS a raw material? (Unlikely for Sales Order in this context)
                continue;
            }

            const productionQty = Number(item.quantity);
            const outputRatio = productionQty / bom.outputQuantity.toNumber();

            for (const bomItem of bom.items) {
                const materialId = bomItem.productVariantId;
                const neededForOne = bomItem.quantity.toNumber();
                const totalNeeded = neededForOne * outputRatio;

                const existing = requirementsMap.get(materialId);
                if (existing) {
                    existing.needed += totalNeeded;
                } else {
                    requirementsMap.set(materialId, {
                        name: bomItem.productVariant.name,
                        needed: totalNeeded,
                        unit: bomItem.productVariant.primaryUnit || 'unit'
                    });
                }
            }
        }

        // 3. Check Inventory for Aggregated Requirements
        const requirements: MaterialRequirement[] = [];
        let globalCanProduce = true;

        for (const [materialId, req] of requirementsMap.entries()) {
            // Check total available stock across ALL locations (or specific raw material warehouse)
            // For MRP, we usually check global or specific "RM Warehouse".
            // Let's check Global for simplicity or use the "raw_material_warehouse" slug if we want to be specific.
            // Using global sum for now.
            const inventory = await prisma.inventory.aggregate({
                where: { productVariantId: materialId },
                _sum: { quantity: true }
            });

            const availableQty = inventory._sum.quantity?.toNumber() || 0;
            const shortageQty = Math.max(0, req.needed - availableQty);

            if (shortageQty > 0) {
                globalCanProduce = false;
            }

            requirements.push({
                materialName: req.name,
                productVariantId: materialId,
                neededQty: req.needed,
                availableQty,
                shortageQty,
                unit: req.unit
            });
        }

        return {
            salesOrderId,
            requirements,
            canProduce: globalCanProduce
        };
    }

    /**
     * Create Production Orders from Sales Order based on MRP simulation.
     * Can create one giant PO or multiple POs (one per SO item).
     * Usually one PO per Line Item of SO is cleaner for tracking.
     */
    static async convertSoToPo(salesOrderId: string) {
        // 1. Run Simulation first to determine status
        const simulation = await this.simulateMaterialRequirements(salesOrderId);

        // Status for ALL created POs
        const status = simulation.canProduce ? ProductionStatus.DRAFT : 'WAITING_MATERIAL' as ProductionStatus;

        const so = await prisma.salesOrder.findUnique({
            where: { id: salesOrderId },
            include: { items: true }
        });

        if (!so) throw new Error("Sales Order not found");

        const createdOrders = [];

        // 2. Create a Production Order for each Sales Order Item
        for (const item of so.items) {
            // Find BOM
            const bom = await prisma.bom.findFirst({
                where: { productVariantId: item.productVariantId, isDefault: true }
            });

            if (!bom) continue; // Skip if no BOM

            // Create PO via ProductionService logic but override status
            // We'll manually create here to control the Status specifically or update checks.
            // Actually `ProductionService.createOrder` sets DRAFT by default.
            // We can call it then update, or implement custom logic here.

            // Let's use prisma directly to set status immediately.

            // Check if PO already exists for this line item (Idempotency)
            const orderNumber = `PO-${so.orderNumber}-${item.id.slice(0, 4)}`;

            let po = await prisma.productionOrder.findFirst({
                where: { orderNumber }
            });

            if (!po) {
                // Create new PO if not exists
                po = await prisma.productionOrder.create({
                    data: {
                        orderNumber,
                        salesOrderId: so.id,
                        bomId: bom.id,
                        plannedQuantity: item.quantity,
                        status: status,
                        plannedStartDate: new Date(),
                        plannedEndDate: so.expectedDate || undefined,
                        locationId: so.sourceLocationId || '',
                        notes: `Generated from SO ${so.orderNumber}. Simulation: ${status}`
                    }
                });

                // Create Planned Materials
                const bomItems = await prisma.bomItem.findMany({
                    where: { bomId: bom.id }
                });

                if (bomItems.length > 0) {
                    const outputRatio = Number(item.quantity) / Number(bom.outputQuantity);

                    await prisma.productionMaterial.createMany({
                        data: bomItems.map(bi => ({
                            productionOrderId: po!.id,
                            productVariantId: bi.productVariantId,
                            quantity: Number(bi.quantity) * outputRatio
                        }))
                    });
                }
            } else {
                // Optional: Update status if needed, or just skip
                // For now, we assume if it exists, it's handled.
            }

            createdOrders.push(po);
        }

        return {
            success: true,
            status,
            orderCount: createdOrders.length,
            simulation
        };
    }
}
