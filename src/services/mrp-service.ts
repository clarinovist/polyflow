import { prisma } from '@/lib/prisma';
import { ProductionStatus, Prisma, ProductionOrder } from '@prisma/client';


export interface MaterialRequirement {
    materialName: string;
    productVariantId: string;
    neededQty: number;
    availableQty: number;
    shortageQty: number;
    unit: string;
    productType: string;
    hasBom: boolean;
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

interface AggregatedRequirement {
    name: string;
    needed: number;
    unit: string;
    productType: string;
    hasBom: boolean;
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

        const requirementsMap = new Map<string, AggregatedRequirement>();
        const missingBoms: { productName: string; productVariantId: string; }[] = [];

        // 2. Recursive Explosion
        for (const item of so.items) {
            await this.explodeRecursively(
                item.productVariantId,
                Number(item.quantity),
                requirementsMap,
                missingBoms,
                includeReserved
            );
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
                unit: req.unit,
                productType: req.productType,
                hasBom: req.hasBom
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
            const createdOrders: ProductionOrder[] = [];
            const shortages = simulation.requirements.filter(r => r.shortageQty > 0);

            // 2. Recursive Work Order Creation
            for (const item of so.items) {
                const materialReq = simulation.requirements.find(r => r.productVariantId === item.productVariantId);

                if (materialReq?.hasBom) {
                    await this.createWorkOrderHierarchy(
                        item.productVariantId,
                        Number(item.quantity),
                        so.id,
                        null, // Root level (Ekstrusi)
                        status,
                        so.sourceLocationId || '',
                        userId || '',
                        tx,
                        createdOrders,
                        simulation.requirements
                    );
                }
            }

            // 3. Create Purchase Requests for ALL shortages that DO NOT have a BOM (Buy items)
            const prItems = shortages.filter(s => !s.hasBom);

            if (prItems.length > 0 && userId) {
                const { PurchaseService } = await import('./purchase-service');
                await PurchaseService.createPurchaseRequest({
                    salesOrderId: so.id,
                    items: prItems.map(s => ({
                        productVariantId: s.productVariantId,
                        quantity: s.shortageQty,
                        notes: `Shortage detected during recursive planning for SO ${so.orderNumber}`
                    })),
                    priority: 'URGENT',
                    notes: `Auto-generated during hierarchical planning for SO ${so.orderNumber}`
                }, userId, tx);
            }

            return {
                success: true,
                status,
                orderCount: createdOrders.length,
                prCreated: prItems.length > 0,
                simulation
            };
        });
    }

    /**
     * Recursive Work Order Creation Helper
     */
    private static async createWorkOrderHierarchy(
        productVariantId: string,
        quantity: number,
        salesOrderId: string,
        parentOrderId: string | null,
        status: ProductionStatus,
        locationId: string,
        userId: string,
        tx: Prisma.TransactionClient,
        createdOrders: ProductionOrder[],
        allRequirements: MaterialRequirement[]
    ) {
        // 1. Find BOM
        const bom = await tx.bom.findFirst({
            where: { productVariantId, isDefault: true }
        });

        if (!bom) return;

        const variant = await tx.productVariant.findUnique({
            where: { id: productVariantId }
        });

        // 2. Generate Order Number
        const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
        const prefix = parentOrderId ? 'SWO' : 'WO'; // Sub-Work Order for children
        const orderNumber = `${prefix}-${productVariantId.slice(0, 4)}-${rand}`;

        // 3. Create the Production Order
        const po = await tx.productionOrder.create({
            data: {
                orderNumber,
                salesOrderId,
                bomId: bom.id,
                plannedQuantity: quantity,
                status,
                plannedStartDate: new Date(),
                locationId,
                parentOrderId,
                notes: `Auto-generated ${parentOrderId ? 'child' : 'root'} stage for ${variant?.name}`
            }
        });
        createdOrders.push(po);

        // 4. Create Planned Materials
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

            // 5. Recursive check: If this material has a shortage AND its own BOM, create a child WO
            const subReq = allRequirements.find(r => r.productVariantId === bi.productVariantId);
            if (subReq && subReq.shortageQty > 0 && subReq.hasBom) {
                await this.createWorkOrderHierarchy(
                    bi.productVariantId,
                    subReq.shortageQty,
                    salesOrderId,
                    po.id,
                    status,
                    locationId,
                    userId,
                    tx,
                    createdOrders,
                    allRequirements
                );
            }
        }
    }

    /**
     * Recursive Explosion Helper
     */
    private static async explodeRecursively(
        productVariantId: string,
        quantity: number,
        requirementsMap: Map<string, AggregatedRequirement>,
        missingBoms: { productName: string; productVariantId: string; }[],
        includeReserved: boolean
    ) {
        // 1. Fetch Item Info (for product type)
        const variant = await prisma.productVariant.findUnique({
            where: { id: productVariantId },
            include: { product: true }
        });

        if (!variant) return;

        // 2. Find BOM
        const bom = await prisma.bom.findFirst({
            where: { productVariantId, isDefault: true },
            include: {
                items: {
                    include: {
                        productVariant: {
                            include: { product: true }
                        }
                    }
                }
            }
        });

        // 3. Mark the item itself in requirements map
        const existing = requirementsMap.get(productVariantId);
        if (existing) {
            existing.needed += quantity;
        } else {
            requirementsMap.set(productVariantId, {
                name: variant.name,
                needed: quantity,
                unit: variant.primaryUnit || 'unit',
                productType: variant.product.productType,
                hasBom: !!bom
            });
        }

        if (!bom) {
            // No BOM -> Leaf node (Raw Material or missing recipe)

            // Fix: Check if it SHOULD have a BOM
            const needsBom = ['FINISHED_GOOD', 'INTERMEDIATE', 'WIP'].includes(variant.product.productType);
            if (needsBom) {
                missingBoms.push({
                    productName: variant.name,
                    productVariantId: productVariantId
                });
            }

            return;
        }

        // 4. Check Stock for Intermediate/Finished Good
        // If we have stock, we only explode for the shortage
        const inventory = await prisma.inventory.aggregate({
            where: { productVariantId },
            _sum: { quantity: true }
        });
        let availableQty = inventory._sum.quantity?.toNumber() || 0;

        if (includeReserved) {
            const reservations = await prisma.stockReservation.aggregate({
                where: { productVariantId, status: 'ACTIVE' },
                _sum: { quantity: true }
            });
            availableQty = Math.max(0, availableQty - (reservations._sum.quantity?.toNumber() || 0));
        }

        const effectiveShortage = Math.max(0, quantity - availableQty);

        // 5. If there's a shortage, explode the BOM for the shortage amount
        if (effectiveShortage > 0) {
            const outputRatio = effectiveShortage / bom.outputQuantity.toNumber();
            for (const bomItem of bom.items) {
                await this.explodeRecursively(
                    bomItem.productVariantId,
                    bomItem.quantity.toNumber() * outputRatio,
                    requirementsMap,
                    missingBoms,
                    includeReserved
                );
            }
        }
    }
}
