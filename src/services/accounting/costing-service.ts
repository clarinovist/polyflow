import { prisma } from '@/lib/core/prisma';
import type { Prisma } from '@prisma/client';

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

    private static resolveIssueCost(
        issue: {
            id: string;
            quantity: Prisma.Decimal;
            issuedAt: Date;
            productVariantId: string;
            batchId: string | null;
            locationId: string | null;
            productVariant: {
                standardCost: Prisma.Decimal | null;
                buyPrice: Prisma.Decimal | null;
                price: Prisma.Decimal | null;
            };
        },
        stockMovements: Array<{
            id: string;
            productVariantId: string;
            batchId: string | null;
            fromLocationId: string | null;
            quantity: Prisma.Decimal;
            cost: Prisma.Decimal | null;
            createdAt: Date;
        }>,
        usedMovementIds: Set<string>
    ): number {
        const matchedMovement = stockMovements.find((movement) => {
            if (usedMovementIds.has(movement.id)) return false;
            if (movement.productVariantId !== issue.productVariantId) return false;
            if ((movement.batchId ?? null) !== (issue.batchId ?? null)) return false;
            if ((movement.fromLocationId ?? null) !== (issue.locationId ?? null)) return false;
            if (Number(movement.quantity) !== Number(issue.quantity)) return false;

            return Math.abs(movement.createdAt.getTime() - issue.issuedAt.getTime()) <= 60_000;
        });

        if (matchedMovement) {
            usedMovementIds.add(matchedMovement.id);
            if (matchedMovement.cost !== null && matchedMovement.cost !== undefined) {
                return matchedMovement.cost.toNumber();
            }
        }

        return Number(
            issue.productVariant.standardCost ??
            issue.productVariant.buyPrice ??
            issue.productVariant.price ??
            0
        );
    }

    /**
     * Calculate COGM for a single Production Order
     */
    static async calculateOrderCost(productionOrderId: string): Promise<ProductionCost> {
        // 1. Fetch Production Order with related data
        const order = await prisma.productionOrder.findUnique({
            where: { id: productionOrderId },
            include: {
                materialIssues: {
                    include: {
                        productVariant: {
                            select: {
                                standardCost: true,
                                buyPrice: true,
                                price: true
                            }
                        }
                    }
                },
                stockMovements: {
                    where: {
                        type: 'OUT',
                        reference: {
                            not: {
                                startsWith: 'VOID:'
                            }
                        }
                    },
                    select: {
                        id: true,
                        productVariantId: true,
                        batchId: true,
                        fromLocationId: true,
                        quantity: true,
                        cost: true,
                        createdAt: true
                    }
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
        const usedMovementIds = new Set<string>();
        for (const issue of order.materialIssues) {
            if (issue.status === 'VOIDED') continue;
            if (!issue.productVariant) {
                console.warn(`Missing product variant for issue ${issue.id} in order ${order.orderNumber}`);
                continue;
            }

            const unitCost = this.resolveIssueCost(issue, order.stockMovements, usedMovementIds);
            materialCost += Number(issue.quantity) * unitCost;
        }

        // 3. Machine Cost
        let machineCost = 0;
        let laborCost = 0;

        for (const exec of order.executions) {
            if (exec.status === 'VOIDED') continue;
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
