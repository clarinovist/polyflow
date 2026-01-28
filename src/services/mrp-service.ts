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
    missingBoms: {
        productName: string;
        productVariantId: string;
    }[];
}

export class MrpService {

    /**
     * Simulate Material Requirements for a Sales Order.
     * Explodes BOMs for MTO/MTS items and aggregates needs.
     */
    static async simulateMaterialRequirements(salesOrderId: string, includeReserved = true): Promise<MrpSimulationResult> {
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

        const missingBoms: { productName: string; productVariantId: string; }[] = [];

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
                // If no BOM, and it's MTO, record it as missing
                if (so.orderType === 'MAKE_TO_ORDER') {
                    missingBoms.push({
                        productName: item.productVariant.name,
                        productVariantId: item.productVariantId
                    });
                }

                // fallback: add the item itself to requirements if no BOM found
                // this ensures that even if it's MTO, we can still trigger a PR for the product itself
                // if the planner decides to process it despite missing BOM.
                const materialId = item.productVariantId;
                const needed = Number(item.quantity);
                const existing = requirementsMap.get(materialId);
                if (existing) {
                    existing.needed += needed;
                } else {
                    requirementsMap.set(materialId, {
                        name: item.productVariant.name,
                        needed,
                        unit: item.productVariant.primaryUnit || 'unit'
                    });
                }
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
            // Check total available stock across ALL locations
            const inventory = await prisma.inventory.aggregate({
                where: { productVariantId: materialId },
                _sum: { quantity: true }
            });

            let availableQty = inventory._sum.quantity?.toNumber() || 0;

            if (includeReserved) {
                const reservations = await prisma.stockReservation.aggregate({
                    where: {
                        productVariantId: materialId,
                        status: 'ACTIVE'
                    },
                    _sum: { quantity: true }
                });
                const reservedQty = reservations._sum.quantity?.toNumber() || 0;
                availableQty = Math.max(0, availableQty - reservedQty);
            }

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
            canProduce: globalCanProduce && missingBoms.length === 0,
            missingBoms
        };
    }

    /**
     * Create Production Orders from Sales Order and trigger Purchase Requests for shortages.
     */
    static async convertSoToPo(salesOrderId: string, userId?: string) {
        // 1. Run Simulation first to determine status and shortages
        const simulation = await this.simulateMaterialRequirements(salesOrderId, true);

        // Status for ALL created POs
        const status = simulation.canProduce ? ProductionStatus.DRAFT : 'WAITING_MATERIAL' as ProductionStatus;

        const so = await prisma.salesOrder.findUnique({
            where: { id: salesOrderId },
            include: { items: true }
        });

        if (!so) throw new Error("Sales Order not found");

        return await prisma.$transaction(async (tx) => {
            const createdOrders = [];

            // 2. Create Production Orders for each line item with a BOM
            for (const item of so.items) {
                const bom = await prisma.bom.findFirst({
                    where: { productVariantId: item.productVariantId, isDefault: true }
                });

                if (!bom) continue; // Skip if no BOM (could be purchased item)

                const orderNumber = `WO-${so.orderNumber}-${item.id.slice(0, 4)}`;

                let po = await tx.productionOrder.findFirst({
                    where: { orderNumber }
                });

                if (!po) {
                    po = await tx.productionOrder.create({
                        data: {
                            orderNumber,
                            salesOrderId: so.id,
                            bomId: bom.id,
                            plannedQuantity: item.quantity,
                            status: status,
                            plannedStartDate: new Date(),
                            plannedEndDate: so.expectedDate || undefined,
                            locationId: so.sourceLocationId || '',
                            notes: `Auto-generated from SO ${so.orderNumber}. Simulation Result: ${status}`
                        }
                    });

                    // Create Planned Materials
                    const bomItems = await tx.bomItem.findMany({
                        where: { bomId: bom.id }
                    });

                    if (bomItems.length > 0) {
                        const outputRatio = Number(item.quantity) / Number(bom.outputQuantity);

                        await tx.productionMaterial.createMany({
                            data: bomItems.map(bi => ({
                                productionOrderId: po!.id,
                                productVariantId: bi.productVariantId,
                                quantity: Number(bi.quantity) * outputRatio
                            }))
                        });
                    }
                }
                createdOrders.push(po);
            }

            // 3. Create Purchase Requests for ALL shortages found in simulation
            const shortages = simulation.requirements.filter(r => r.shortageQty > 0);
            if (shortages.length > 0 && userId) {
                // Import PurchaseService dynamically or ensure it's available. 
                // Since it's in a different folder, we use full path or assume it's imported at top (if possible).
                // Actually MrpService doesn't import PurchaseService currently.
                // I will add the import at the top later or use a dynamic import.
                // For now, let's assume it's available or use regular prisma if we can't easily import.

                // Let's use dynamic import to avoid circular dependencies if any.
                const { PurchaseService } = await import('./purchase-service');

                await PurchaseService.createPurchaseRequest({
                    salesOrderId: so.id,
                    items: shortages.map(s => ({
                        productVariantId: s.productVariantId,
                        quantity: s.shortageQty,
                        notes: `Shortage detected during planning for SO ${so.orderNumber}`
                    })),
                    priority: 'URGENT',
                    notes: `Auto-generated during planning conversion for SO ${so.orderNumber}`
                }, userId, tx);
            }

            return {
                success: true,
                status,
                orderCount: createdOrders.length,
                prCreated: shortages.length > 0,
                simulation
            };
        });
    }
}
