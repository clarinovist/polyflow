import { prisma } from '@/lib/core/prisma';
import type { Prisma } from '@prisma/client';
import { NotFoundError } from '@/lib/errors/errors';
import { executionCostHours } from '@/lib/production/execution-running';
import { readConversionCostSetting } from '@/services/settings/conversion-cost-setting-service';
import {
    allocateByMaterial,
    readConversionPool,
    type ConversionPoolAccount,
} from './conversion-cost-allocation';

export interface ProductionCost {
    productionOrderId: string;
    orderNumber: string;
    status: string;
    materialCost: number;
    machineCost: number;
    laborCost: number;
    /** Journal conversion cost split to this SPK (tenant setting); 0 otherwise. */
    overheadCost: number;
    totalCost: number;
    quantityProduced: number;
    unitCost: number;
}

export interface ConversionCostSummary {
    enabled: boolean;
    pool: number;
    allocated: number;
    /** Pool with no completed SPK (or no material) to carry it this period. */
    unallocated: number;
    byAccount: ConversionPoolAccount[];
}

export interface PeriodCostReport {
    costs: ProductionCost[];
    conversion: ConversionCostSummary;
}

const SESSION_CONVERSION: ConversionCostSummary = {
    enabled: false,
    pool: 0,
    allocated: 0,
    unallocated: 0,
    byAccount: [],
};

function withOverhead(cost: ProductionCost, overheadCost: number): ProductionCost {
    const totalCost = cost.materialCost + cost.machineCost + cost.laborCost + overheadCost;
    return {
        ...cost,
        overheadCost,
        totalCost,
        unitCost: cost.quantityProduced > 0 ? totalCost / cost.quantityProduced : 0,
    };
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
        usedMovementIds: Set<string>,
    ): number {
        const matchedMovement = stockMovements.find((movement) => {
            if (usedMovementIds.has(movement.id)) return false;
            if (movement.productVariantId !== issue.productVariantId)
                return false;
            if ((movement.batchId ?? null) !== (issue.batchId ?? null))
                return false;
            if (
                (movement.fromLocationId ?? null) !== (issue.locationId ?? null)
            )
                return false;
            if (Number(movement.quantity) !== Number(issue.quantity))
                return false;

            return (
                Math.abs(
                    movement.createdAt.getTime() - issue.issuedAt.getTime(),
                ) <= 60_000
            );
        });

        if (matchedMovement) {
            usedMovementIds.add(matchedMovement.id);
            if (
                matchedMovement.cost !== null &&
                matchedMovement.cost !== undefined
            ) {
                return matchedMovement.cost.toNumber();
            }
        }

        return Number(
            issue.productVariant.standardCost ??
                issue.productVariant.buyPrice ??
                issue.productVariant.price ??
                0,
        );
    }

    /**
     * Calculate COGM for a single Production Order
     */
    static async calculateOrderCost(
        productionOrderId: string,
        options: { sessionConversion?: boolean } = {},
    ): Promise<ProductionCost> {
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
                                price: true,
                            },
                        },
                    },
                },
                stockMovements: {
                    where: {
                        type: 'OUT',
                        reference: {
                            not: {
                                startsWith: 'VOID:',
                            },
                        },
                    },
                    select: {
                        id: true,
                        productVariantId: true,
                        batchId: true,
                        fromLocationId: true,
                        quantity: true,
                        cost: true,
                        createdAt: true,
                    },
                },
                executions: {
                    include: {
                        machine: true,
                        operator: {
                            select: {
                                dailyRate: true,
                                standardDayHours: true,
                                payType: true,
                            },
                        },
                    },
                },
            },
        });

        if (!order)
            throw new NotFoundError('Production Order', productionOrderId);

        // 2. Material Cost
        let materialCost = 0;
        const usedMovementIds = new Set<string>();
        for (const issue of order.materialIssues) {
            // STAGED = transfer ke WIP (belum konsumsi HPP). VOIDED = dibatalkan.
            if (issue.status === 'VOIDED' || issue.status === 'STAGED')
                continue;
            if (!issue.productVariant) {
                console.warn(
                    `Missing product variant for issue ${issue.id} in order ${order.orderNumber}`,
                );
                continue;
            }

            const unitCost = this.resolveIssueCost(
                issue,
                order.stockMovements,
                usedMovementIds,
            );
            materialCost += Number(issue.quantity) * unitCost;
        }

        // 3. Machine Cost
        let machineCost = 0;
        let laborCost = 0;

        // A tenant that books conversion through journals carries no session cost.
        const costedExecutions =
            options.sessionConversion === false ? [] : order.executions;
        for (const exec of costedExecutions) {
            if (exec.status === 'VOIDED') continue;
            const durationHours = executionCostHours(exec, order.status);

            if (exec.machine) {
                machineCost +=
                    durationHours * Number(exec.machine.costPerHour || 0);
            }
            if (exec.operator) {
                const dailyRate = Number(exec.operator.dailyRate || 0);
                const standardDayHours = Number(
                    exec.operator.standardDayHours || 8,
                );
                const dayEquivalent =
                    standardDayHours > 0 ? durationHours / standardDayHours : 0;
                // PIECE: use snapshot pieceEarnings (qty × rate) instead of time-based formula
                if (
                    exec.operator.payType === 'PIECE' &&
                    exec.pieceEarnings != null
                ) {
                    laborCost += Number(exec.pieceEarnings);
                } else {
                    laborCost += dayEquivalent * dailyRate;
                }
            }
        }

        const totalCost = materialCost + machineCost + laborCost;
        const quantityProduced = Number(order.actualQuantity || 0);
        const unitCost =
            quantityProduced > 0 ? totalCost / quantityProduced : 0;

        return {
            productionOrderId: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            materialCost,
            machineCost,
            laborCost,
            overheadCost: 0,
            totalCost,
            quantityProduced,
            unitCost,
        };
    }

    /**
     * Get Costs for All Completed Production Orders in a Date Range
     */
    static async getPeriodCosts(startDate?: Date, endDate?: Date) {
        return (await this.getPeriodCostReport(startDate, endDate)).costs;
    }

    /**
     * Period costs plus, when the tenant books conversion through journals,
     * the pool of its chosen accounts split across the SPKs completed in it.
     */
    static async getPeriodCostReport(
        startDate?: Date,
        endDate?: Date,
    ): Promise<PeriodCostReport> {
        if (!startDate || isNaN(startDate.getTime())) {
            startDate = new Date(
                new Date().getFullYear(),
                new Date().getMonth(),
                1,
            );
        }
        if (!endDate || isNaN(endDate.getTime())) {
            endDate = new Date();
        }

        const range = { gte: startDate, lte: endDate };
        // updatedAt moves whenever an old SPK is touched, so a finished SPK
        // belongs to the period it ended in. Running SPKs stay activity-based.
        const orders = await prisma.productionOrder.findMany({
            where: {
                OR: [
                    { status: 'IN_PROGRESS', updatedAt: range },
                    { status: 'COMPLETED', actualEndDate: range },
                    // Completed before end dates were recorded: old selection until backfilled.
                    { status: 'COMPLETED', actualEndDate: null, updatedAt: range },
                ],
            },
            select: { id: true },
        });

        const setting = await readConversionCostSetting();
        const results = await Promise.allSettled(
            orders.map((o) =>
                this.calculateOrderCost(o.id, {
                    sessionConversion: !setting.enabled,
                }),
            ),
        );
        const costs = results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => (r as PromiseFulfilledResult<ProductionCost>).value);
        if (!setting.enabled) return { costs, conversion: SESSION_CONVERSION };

        // Same recipients as Alokasi FOH: only SPKs completed in the period.
        const pool = await readConversionPool(prisma, setting.accountIds, startDate, endDate);
        const split = allocateByMaterial(
            costs.filter((c) => c.status === 'COMPLETED'),
            pool.total,
        );
        return {
            costs: costs.map((c) =>
                withOverhead(c, split.allocations.get(c.productionOrderId) ?? 0),
            ),
            conversion: {
                enabled: true,
                pool: pool.total,
                allocated: split.allocated,
                unallocated: split.unallocated,
                byAccount: pool.byAccount,
            },
        };
    }
}
