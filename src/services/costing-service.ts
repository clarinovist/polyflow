import { prisma } from '@/lib/prisma';

export interface ProductionCost {
    productionOrderId: string;
    orderNumber: string;
    materialCost: number;
    machineCost: number;
    laborCost: number;
    totalCost: number;
    quantityProduced: number;
    unitCost: number;
}

export class CostingService {

    /**
     * Calculate COGM for a single Production Order
     */
    static async calculateOrderCost(productionOrderId: string): Promise<ProductionCost> {
        // 1. Fetch Production Order with related data
        const order = await prisma.productionOrder.findUnique({
            where: { id: productionOrderId },
            include: {
                materialIssues: {
                    include: { productVariant: { include: { inventories: true } } } // Need cost info
                },
                executions: {
                    include: {
                        machine: true,
                        operator: true
                    }
                }
            }
        });

        if (!order) throw new Error("Production Order not found");

        // 2. Material Cost
        let materialCost = 0;
        for (const issue of order.materialIssues) {
            // Priority: Average Cost -> Standard Cost -> Buy Price -> Reference Price -> 0
            if (!issue.productVariant) {
                console.warn(`Missing product variant for issue ${issue.id} in order ${order.orderNumber}`);
                continue;
            }
            const avgCost = issue.productVariant.inventories?.[0]?.averageCost ??
                issue.productVariant.standardCost ??
                issue.productVariant.buyPrice ??
                issue.productVariant.price ?? 0;
            materialCost += Number(issue.quantity) * Number(avgCost);
        }

        // 3. Machine Cost
        let machineCost = 0;
        let laborCost = 0;

        for (const exec of order.executions) {
            const endTime = exec.endTime ? new Date(exec.endTime) : new Date();
            const startTime = new Date(exec.startTime);
            const durationMilliseconds = endTime.getTime() - startTime.getTime();
            const durationHours = durationMilliseconds > 0 ? durationMilliseconds / (1000 * 60 * 60) : 0;

            if (exec.machine) {
                machineCost += durationHours * Number(exec.machine.costPerHour || 0);
            }
            if (exec.operator) {
                laborCost += durationHours * Number(exec.operator.hourlyRate || 0);
            }
        }

        const totalCost = materialCost + machineCost + laborCost;
        const quantityProduced = Number(order.actualQuantity || 0);
        const unitCost = quantityProduced > 0 ? totalCost / quantityProduced : 0;

        return {
            productionOrderId: order.id,
            orderNumber: order.orderNumber,
            materialCost,
            machineCost,
            laborCost,
            totalCost,
            quantityProduced,
            unitCost
        };
    }

    /**
     * Get Costs for All Completed Production Orders in a Date Range
     */
    static async getPeriodCosts(startDate?: Date, endDate?: Date) {
        if (!startDate || isNaN(startDate.getTime())) {
            startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        }
        if (!endDate || isNaN(endDate.getTime())) {
            endDate = new Date();
        }

        const orders = await prisma.productionOrder.findMany({
            where: {
                status: { in: ['COMPLETED', 'IN_PROGRESS'] }, // Analyze In Progress too
                updatedAt: {
                    gte: startDate,
                    lte: endDate
                }
            },
            select: { id: true }
        });

        const results = await Promise.allSettled(orders.map(o => this.calculateOrderCost(o.id)));

        return results
            .filter(r => r.status === 'fulfilled')
            .map(r => (r as PromiseFulfilledResult<ProductionCost>).value);
    }
}
