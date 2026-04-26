import { prisma } from '@/lib/core/prisma';
import { MovementType, ProductionStatus, Prisma } from '@prisma/client';

export interface PoCostResult {
    id: string;
    orderNumber: string;
    productName: string;
    skuCode: string;
    completedAt: Date | null;
    quantity: number;
    materialCost: number;
    conversionCost: number;
    totalCost: number;
    unitCost: number;
}

export interface WipResult {
    totalWipValue: number;
    orderCount: number;
    orders: {
        id: string;
        orderNumber: string;
        productName: string;
        currentMaterialCost: number;
        startDate: Date | null;
    }[];
}

type OrderCostSeed = {
    id: string;
    orderNumber: string;
};

function loadMaterialCostByOrder(movements: Array<{ id: string; productionOrderId: string | null; reference: string | null; cost: Prisma.Decimal | null; quantity: Prisma.Decimal }>, orders: OrderCostSeed[]): Map<string, number> {
    const costByOrderId = new Map<string, number>();
    const orderById = new Map(orders.map(order => [order.id, order]));

    const referenceMatchers = orders.map(order => ({
        orderId: order.id,
        needle: `PO-${order.orderNumber}`
    }));

    for (const movement of movements) {
        let targetOrderId: string | null = null;

        if (movement.productionOrderId && orderById.has(movement.productionOrderId)) {
            targetOrderId = movement.productionOrderId;
        } else if (movement.reference) {
            const matched = referenceMatchers.find(ref => movement.reference?.includes(ref.needle));
            targetOrderId = matched?.orderId ?? null;
        }

        if (!targetOrderId) continue;

        const current = costByOrderId.get(targetOrderId) ?? 0;
        const cost = Number(movement.cost || 0);
        const qty = Number(movement.quantity);
        costByOrderId.set(targetOrderId, current + (cost * qty));
    }

    return costByOrderId;
}

export class CostReportingService {
    /**
     * Get Costing Report for Finished Goods (Completed Orders)
     */
    static async getFinishedGoodsCosting(startDate?: Date, endDate?: Date): Promise<PoCostResult[]> {
        const where: Prisma.ProductionOrderWhereInput = {
            status: ProductionStatus.COMPLETED
        };

        if (startDate && endDate) {
            where.actualEndDate = {
                gte: startDate,
                lte: endDate
            };
        }

        const orders = await prisma.productionOrder.findMany({
            where,
            include: {
                bom: {
                    include: {
                        productVariant: {
                            include: { product: true }
                        }
                    }
                }
            },
            orderBy: { actualEndDate: 'desc' }
        });

        if (orders.length === 0) return [];

        const orderIds = orders.map(order => order.id);
        const referenceFilters = orders.map(order => ({ reference: { contains: `PO-${order.orderNumber}` } }));

        const movements = await prisma.stockMovement.findMany({
            where: {
                type: MovementType.OUT,
                OR: [
                    { productionOrderId: { in: orderIds } },
                    ...referenceFilters
                ]
            },
            select: {
                id: true,
                productionOrderId: true,
                reference: true,
                cost: true,
                quantity: true
            }
        });

        const materialCostByOrder = loadMaterialCostByOrder(
            movements,
            orders.map(order => ({ id: order.id, orderNumber: order.orderNumber }))
        );

        const results: PoCostResult[] = [];

        for (const order of orders) {
            const materialCost = materialCostByOrder.get(order.id) ?? 0;

            const conversionCost = Number(order.estimatedConversionCost || 0);
            const totalCost = materialCost + conversionCost;
            const quantity = Number(order.actualQuantity || 0);
            const unitCost = quantity > 0 ? totalCost / quantity : 0;

            results.push({
                id: order.id,
                orderNumber: order.orderNumber,
                productName: order.bom.productVariant.product.name,
                skuCode: order.bom.productVariant.skuCode,
                completedAt: order.actualEndDate,
                quantity,
                materialCost,
                conversionCost,
                totalCost,
                unitCost
            });
        }

        return results;
    }

    /**
     * Get WIP Valuation (Value of In-Progress Orders)
     */
    static async getWipValuation(): Promise<WipResult> {
        // Active orders: RELEASED (maybe materials issued?), IN_PROGRESS
        const orders = await prisma.productionOrder.findMany({
            where: {
                status: {
                    in: [ProductionStatus.IN_PROGRESS, ProductionStatus.RELEASED]
                }
            },
            include: {
                bom: {
                    include: {
                        productVariant: {
                            include: { product: true }
                        }
                    }
                }
            }
        });

        if (orders.length === 0) {
            return {
                totalWipValue: 0,
                orderCount: 0,
                orders: []
            };
        }

        const orderIds = orders.map(order => order.id);
        const referenceFilters = orders.map(order => ({ reference: { contains: `PO-${order.orderNumber}` } }));

        const movements = await prisma.stockMovement.findMany({
            where: {
                type: MovementType.OUT,
                OR: [
                    { productionOrderId: { in: orderIds } },
                    ...referenceFilters
                ]
            },
            select: {
                id: true,
                productionOrderId: true,
                reference: true,
                cost: true,
                quantity: true
            }
        });

        const materialCostByOrder = loadMaterialCostByOrder(
            movements,
            orders.map(order => ({ id: order.id, orderNumber: order.orderNumber }))
        );

        let totalWipValue = 0;
        const activeOrders = [];

        for (const order of orders) {
            const currentMaterialCost = materialCostByOrder.get(order.id) ?? 0;

            // We don't accure conversion cost until completion usually, or maybe partial?
            // Conservative: WIP = Materials Consumed.

            if (currentMaterialCost > 0) {
                totalWipValue += currentMaterialCost;
                activeOrders.push({
                    id: order.id,
                    orderNumber: order.orderNumber,
                    productName: order.bom.productVariant.product.name,
                    currentMaterialCost,
                    startDate: order.actualStartDate || order.plannedStartDate
                });
            }
        }

        return {
            totalWipValue,
            orderCount: activeOrders.length,
            orders: activeOrders
        };
    }

    /**
     * Get Detailed Costing for a Specific Order
     */
    static async getOrderCosting(orderId: string): Promise<PoCostResult | null> {
        const order = await prisma.productionOrder.findUnique({
            where: { id: orderId },
            include: {
                bom: {
                    include: {
                        productVariant: {
                            include: { product: true }
                        }
                    }
                }
            }
        });

        if (!order) return null;

        const movements = await prisma.stockMovement.findMany({
            where: {
                reference: { contains: `PO-${order.orderNumber}` },
                type: MovementType.OUT
            }
        });

        let materialCost = 0;
        movements.forEach(m => {
            const cost = Number(m.cost || 0);
            const qty = Number(m.quantity);
            materialCost += cost * qty;
        });

        const conversionCost = Number(order.estimatedConversionCost || 0);
        const totalCost = materialCost + conversionCost;
        const quantity = Number(order.actualQuantity || 0);
        const unitCost = quantity > 0 ? totalCost / quantity : 0;

        return {
            id: order.id,
            orderNumber: order.orderNumber,
            productName: order.bom.productVariant.product.name,
            skuCode: order.bom.productVariant.skuCode,
            completedAt: order.actualEndDate,
            quantity,
            materialCost,
            conversionCost,
            totalCost,
            unitCost
        };
    }
}
