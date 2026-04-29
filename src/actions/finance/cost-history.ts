'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from '@/lib/core/prisma';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { Prisma } from '@prisma/client';
import { safeAction, NotFoundError } from '@/lib/errors/errors';
import { BomCostCascadeService } from '@/services/production/bom-cost-cascade-service';

export type CostChangeReason = 'MANUAL' | 'PURCHASE_GR' | 'STOCK_OPNAME' | 'IMPORT' | 'BOM_UPDATE' | 'BOM_CASCADE';

type UpdateCostOptions = {
    skipCascade?: boolean;
    defaultOnlyCascade?: boolean;
};

// Workaround for missing generated types in the current environment
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtendedClient = Prisma.TransactionClient & { costHistory: any };

export const getCostHistory = withTenant(
async function getCostHistory(variantId: string) {
    return safeAction(async () => {
        await requireAuth();

        const db = prisma as unknown as ExtendedClient;
        const history = await db.costHistory.findMany({
            where: { productVariantId: variantId },
            include: {
                createdBy: {
                    select: { name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return serializeData(history);
    });
}
);

export const updateStandardCost = withTenant(
async function updateStandardCost(
    variantId: string,
    newCost: number,
    reason: CostChangeReason,
    referenceId?: string,
    tx?: Prisma.TransactionClient,
    options?: UpdateCostOptions,
) {
    return safeAction(async () => {
        const session = await requireAuth();
        const userId = session?.user?.id;

        if (!userId) throw new Error('User ID missing');

        const db = (tx || prisma) as unknown as ExtendedClient;

        const variant = await db.productVariant.findUnique({
            where: { id: variantId },
            select: { standardCost: true }
        });

        if (!variant) throw new NotFoundError('Product Variant', variantId);

        const previousCost = variant.standardCost ? Number(variant.standardCost) : null;

        // Calculate percentage change
        let changePercent = null;
        if (previousCost !== null && previousCost !== 0) {
            changePercent = ((newCost - previousCost) / previousCost) * 100;
        }

        const execute = async (client: ExtendedClient) => {
            const updatedVariant = await client.productVariant.update({
                where: { id: variantId },
                data: { standardCost: newCost }
            });

            await client.costHistory.create({
                data: {
                    productVariantId: variantId,
                    previousCost,
                    newCost,
                    changeReason: reason,
                    referenceId,
                    changePercent,
                    createdById: userId
                }
            });

            return serializeData(updatedVariant);
        };

        const updatedVariant = tx
            ? await execute(tx as unknown as ExtendedClient)
            : await prisma.$transaction(async (internalTx) => {
                return await execute(internalTx as unknown as ExtendedClient);
            });

        const cascadeEligibleReasons: CostChangeReason[] = ['MANUAL', 'PURCHASE_GR', 'STOCK_OPNAME', 'IMPORT'];
        const shouldCascade = !options?.skipCascade
            && cascadeEligibleReasons.includes(reason);

        if (shouldCascade) {
            await BomCostCascadeService.cascadeFromVariants({
                rootVariantIds: [variantId],
                defaultOnly: options?.defaultOnlyCascade ?? true,
                referenceId: `cost-update:${referenceId || variantId}`,
                userId,
                tx,
            });
        }

        return updatedVariant;
    });
}
);
