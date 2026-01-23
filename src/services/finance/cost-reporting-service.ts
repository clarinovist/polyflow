import { prisma } from '@/lib/prisma';
import { MovementType, ProductionStatus } from '@prisma/client';

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

export class CostReportingService {
    /**
     * Get Costing Report for Finished Goods (Completed Orders)
     */
    static async getFinishedGoodsCosting(startDate?: Date, endDate?: Date): Promise<PoCostResult[]> {
        const where: any = {
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

        const results: PoCostResult[] = [];

        for (const order of orders) {
            // Calculate actual material cost from Stock Movements
            // Convention: Reference contains "PO-{orderNumber}"
            // We look for movements OUT (Materials consumed) related to this PO.
            // Note: This relies on the convention established in ProductionService.
            const prefix = order.orderNumber; // Assumes passed reference has this.
            // Actually, ProductionService uses `PO-${order.orderNumber}`.

            const movements = await prisma.stockMovement.findMany({
                where: {
                    reference: { contains: `PO-${prefix}` },
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

        let totalWipValue = 0;
        const activeOrders = [];

        for (const order of orders) {
            // Check for material issues (Movements OUT)
            // Even if just RELEASED, if materials were issued in batch, we count them.
            const movements = await prisma.stockMovement.findMany({
                where: {
                    reference: { contains: `PO-${order.orderNumber}` },
                    type: MovementType.OUT
                }
            });

            let currentMaterialCost = 0;
            movements.forEach(m => {
                const cost = Number(m.cost || 0);
                const qty = Number(m.quantity);
                currentMaterialCost += cost * qty;
            });

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
}
