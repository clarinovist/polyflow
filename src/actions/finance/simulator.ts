'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import {
    buildBomSimulationDataset,
    simulateBomCosts as simulateBomCostsUtil,
    type PriceOverrides,
} from '@/lib/utils/bom-simulator';

async function fetchSimulationBomSources() {
    return prisma.bom.findMany({
        select: {
            id: true,
            name: true,
            category: true,
            outputQuantity: true,
            productVariantId: true,
            productVariant: {
                select: {
                    id: true,
                    name: true,
                    skuCode: true,
                    product: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
            items: {
                select: {
                    id: true,
                    productVariantId: true,
                    quantity: true,
                    scrapPercentage: true,
                    productVariant: {
                        select: {
                            id: true,
                            name: true,
                            skuCode: true,
                            standardCost: true,
                            buyPrice: true,
                            price: true,
                            product: {
                                select: {
                                    name: true,
                                },
                            },
                            inventories: {
                                select: {
                                    quantity: true,
                                    averageCost: true,
                                },
                            },
                        },
                    },
                },
            },
        },
        orderBy: [
            { name: 'asc' },
            { updatedAt: 'desc' },
        ],
    });
}

export const getSimulationData = withTenant(
async function getSimulationData() {
    return safeAction(async () => {
        await requireAuth();

        const bomSources = await fetchSimulationBomSources();
        const dataset = buildBomSimulationDataset(bomSources);

        return serializeData(dataset);
    });
}
);

export const simulateBomCosts = withTenant(
async function simulateBomCosts(priceOverrides: PriceOverrides) {
    return safeAction(async () => {
        await requireAuth();

        const bomSources = await fetchSimulationBomSources();
        const dataset = buildBomSimulationDataset(bomSources);
        const impacts = simulateBomCostsUtil(dataset.boms, priceOverrides);

        return serializeData(impacts);
    });
}
);