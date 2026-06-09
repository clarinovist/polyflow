import { prisma } from '@/lib/core/prisma';
import type { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { calculateBomCost } from '@/lib/utils/production-utils';

const CASCADE_COST_EPSILON = 0.0001;

type CascadeOptions = {
    rootVariantIds: string[];
    defaultOnly?: boolean;
    referenceId?: string;
    userId?: string;
    maxDepth?: number;
    tx?: Prisma.TransactionClient;
};

type ValidateCycleOptions = {
    outputVariantId: string;
    itemVariantIds: string[];
    ignoreBomId?: string;
};

type BomCostPayload = {
    id: string;
    productVariantId: string;
    outputQuantity: unknown;
    items: Array<{
        quantity: unknown;
        scrapPercentage: unknown;
        productVariant: {
            standardCost?: unknown;
            buyPrice?: unknown;
            price?: unknown;
        } | null;
    }>;
};

export class BomCostCascadeService {
    static async validateNoBomCycle({ outputVariantId, itemVariantIds, ignoreBomId }: ValidateCycleOptions) {
        if (itemVariantIds.includes(outputVariantId)) {
            throw new BusinessRuleError('Recipe (BOM) is cyclic: output variant cannot be an ingredient in the same chain.');
        }

        for (const itemVariantId of itemVariantIds) {
            const reachesOutput = await this.hasPathToVariant(itemVariantId, outputVariantId, ignoreBomId, new Set<string>());
            if (reachesOutput) {
                throw new BusinessRuleError('Recipe (BOM) is cyclic: ingredient chain loops back to output variant.');
            }
        }
    }

    static async cascadeFromVariants({
        rootVariantIds,
        defaultOnly = true,
        referenceId,
        userId,
        maxDepth = 20,
        tx,
    }: CascadeOptions) {
        const db = (tx || prisma) as Prisma.TransactionClient;
        let frontier = new Set(rootVariantIds.filter(Boolean));
        const visitedBomIds = new Set<string>();
        const updatedVariantIds = new Set<string>();
        let depth = 0;

        while (frontier.size > 0) {
            if (depth >= maxDepth) {
                throw new BusinessRuleError('BOM cost cascade exceeded safe traversal depth. Please review potential cyclic BOM dependencies.');
            }

            const parentBoms = await db.bom.findMany({
                where: {
                    ...(defaultOnly ? { isDefault: true } : {}),
                    items: {
                        some: {
                            productVariantId: {
                                in: Array.from(frontier),
                            },
                        },
                    },
                },
                select: {
                    id: true,
                    productVariantId: true,
                    outputQuantity: true,
                    items: {
                        select: {
                            quantity: true,
                            scrapPercentage: true,
                            productVariant: {
                                select: {
                                    standardCost: true,
                                    buyPrice: true,
                                    price: true,
                                },
                            },
                        },
                    },
                },
            });

            if (parentBoms.length === 0) {
                break;
            }

            const nextFrontier = new Set<string>();

            // Batch-fetch all existing variants for BOM parents
            const parentVariantIds = Array.from(new Set(
                (parentBoms as BomCostPayload[]).map(b => b.productVariantId)
            ));
            const existingVariants = parentVariantIds.length > 0
                ? await db.productVariant.findMany({
                    where: { id: { in: parentVariantIds } },
                    select: { id: true, standardCost: true },
                })
                : [];
            const existingVariantMap = new Map(existingVariants.map(v => [v.id, v]));

            const pendingUpdates: Array<{ id: string; standardCost: number }> = [];
            const pendingCostHistories: Array<{
                productVariantId: string;
                previousCost: number | null;
                newCost: number;
                changeReason: string;
                referenceId: string;
                changePercent: number | null;
                createdById: string | null;
            }> = [];

            for (const bom of parentBoms as BomCostPayload[]) {
                if (visitedBomIds.has(bom.id)) {
                    continue;
                }
                visitedBomIds.add(bom.id);

                const totalCost = calculateBomCost(bom.items);
                const outputQty = Number(bom.outputQuantity || 1);
                const nextUnitCost = outputQty > 0 ? (totalCost / outputQty) : totalCost;

                const existingVariant = existingVariantMap.get(bom.productVariantId);

                if (!existingVariant) {
                    continue;
                }

                const previousCost = existingVariant.standardCost === null
                    ? null
                    : Number(existingVariant.standardCost);
                const delta = previousCost === null ? nextUnitCost : Math.abs(previousCost - nextUnitCost);

                if (delta <= CASCADE_COST_EPSILON) {
                    continue;
                }

                pendingUpdates.push({
                    id: bom.productVariantId,
                    standardCost: nextUnitCost,
                });

                const changePercent = previousCost !== null && previousCost !== 0
                    ? ((nextUnitCost - previousCost) / previousCost) * 100
                    : null;

                pendingCostHistories.push({
                    productVariantId: bom.productVariantId,
                    previousCost,
                    newCost: nextUnitCost,
                    changeReason: 'BOM_CASCADE',
                    referenceId: referenceId
                        ? `${referenceId}|bom:${bom.id}|depth:${depth + 1}`
                        : `bom:${bom.id}|depth:${depth + 1}`,
                    changePercent,
                    createdById: userId ?? null,
                });

                updatedVariantIds.add(bom.productVariantId);
                nextFrontier.add(bom.productVariantId);
            }

            // Batch execute all updates and creates
            if (pendingUpdates.length > 0) {
                await Promise.all(
                    pendingUpdates.map(u =>
                        db.productVariant.update({
                            where: { id: u.id },
                            data: { standardCost: u.standardCost },
                        })
                    )
                );

                await db.costHistory.createMany({
                    data: pendingCostHistories,
                });
            }

            frontier = nextFrontier;
            depth += 1;
        }

        return {
            updatedCount: updatedVariantIds.size,
            updatedVariantIds: Array.from(updatedVariantIds),
            visitedBomIds: Array.from(visitedBomIds),
            depthTraversed: depth,
        };
    }

    private static async hasPathToVariant(
        currentVariantId: string,
        targetVariantId: string,
        ignoreBomId: string | undefined,
        visitedVariantIds: Set<string>
    ): Promise<boolean> {
        if (currentVariantId === targetVariantId) {
            return true;
        }

        if (visitedVariantIds.has(currentVariantId)) {
            return false;
        }
        visitedVariantIds.add(currentVariantId);

        const childBoms = await prisma.bom.findMany({
            where: {
                productVariantId: currentVariantId,
                ...(ignoreBomId ? { id: { not: ignoreBomId } } : {}),
            },
            select: {
                id: true,
                items: {
                    select: {
                        productVariantId: true,
                    },
                },
            },
        });

        for (const bom of childBoms) {
            for (const item of bom.items) {
                const reachesTarget = await this.hasPathToVariant(
                    item.productVariantId,
                    targetVariantId,
                    ignoreBomId,
                    visitedVariantIds
                );
                if (reachesTarget) {
                    return true;
                }
            }
        }

        return false;
    }
}