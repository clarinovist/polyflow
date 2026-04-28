'use server';

import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import { safeAction } from '@/lib/errors/errors';
import { requireAuth } from '@/lib/tools/auth-checks';
import { serializeData } from '@/lib/utils/utils';
import { asNumber, getCurrentUnitCost } from '@/lib/utils/current-cost';
import { getHppBenchmarks } from '@/services/production/hpp-benchmark-service';
import {
    simulateHpp,
    type HppBom,
    type HppDataset,
    type HppOverrides,
    type HppBomResult,
} from '@/lib/utils/hpp-calculator';

async function fetchHppBomSources() {
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
                        select: { name: true },
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
                                select: { name: true },
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
        orderBy: [{ name: 'asc' }, { updatedAt: 'desc' }],
    });
}

function normalizeBomForHpp(
    bom: Awaited<ReturnType<typeof fetchHppBomSources>>[number],
    benchmarkLaborPerUnit: number,
    benchmarkMachinePerUnit: number
): HppBom {
    const outputQty = asNumber(bom.outputQuantity) || 1;

    const items = bom.items.map((item) => ({
        id: item.id,
        productVariantId: item.productVariantId,
        quantity: asNumber(item.quantity),
        scrapPercentage: asNumber(item.scrapPercentage),
        currentMaterialCost: getCurrentUnitCost(item.productVariant),
        productVariant: {
            id: item.productVariant?.id ?? item.productVariantId,
            name: item.productVariant?.name ?? 'Unknown Material',
            skuCode: item.productVariant?.skuCode ?? '-',
            productName: item.productVariant?.product?.name ?? '-',
        },
    }));

    const totalMaterial = items.reduce((sum, item) => {
        const scrapMultiplier = 1 + (item.scrapPercentage / 100);
        return sum + item.currentMaterialCost * item.quantity * scrapMultiplier;
    }, 0);

    const baselineMaterialPerUnit = outputQty > 0 ? totalMaterial / outputQty : totalMaterial;

    return {
        id: bom.id,
        name: bom.name,
        category: String(bom.category ?? 'STANDARD'),
        outputQuantity: outputQty,
        productVariantId: bom.productVariantId,
        productVariant: {
            id: bom.productVariant.id,
            name: bom.productVariant.name,
            skuCode: bom.productVariant.skuCode,
            productName: bom.productVariant.product?.name ?? '-',
        },
        items,
        baselineMaterialPerUnit,
        benchmarkLaborPerUnit,
        benchmarkMachinePerUnit,
    };
}

export const getHppCalculatorData = withTenant(
    async function getHppCalculatorData(): Promise<{ success: boolean; data?: HppDataset; error?: string }> {
        return safeAction(async () => {
            await requireAuth();

            const bomSources = await fetchHppBomSources();
            const bomIds = bomSources.map((b) => b.id);
            const benchmarkMap = await getHppBenchmarks(bomIds);

            const boms: HppBom[] = bomSources.map((bom) => {
                const benchmark = benchmarkMap.get(bom.id);
                return normalizeBomForHpp(
                    bom,
                    benchmark?.avgLaborPerUnit ?? 0,
                    benchmark?.avgMachinePerUnit ?? 0
                );
            });

            return serializeData({ boms } satisfies HppDataset);
        });
    }
);

export const calculateHpp = withTenant(
    async function calculateHpp(overrides: HppOverrides): Promise<{ success: boolean; data?: HppBomResult[]; error?: string }> {
        return safeAction(async () => {
            await requireAuth();

            const bomSources = await fetchHppBomSources();
            const bomIds = bomSources.map((b) => b.id);
            const benchmarkMap = await getHppBenchmarks(bomIds);

            const boms: HppBom[] = bomSources.map((bom) => {
                const benchmark = benchmarkMap.get(bom.id);
                return normalizeBomForHpp(
                    bom,
                    benchmark?.avgLaborPerUnit ?? 0,
                    benchmark?.avgMachinePerUnit ?? 0
                );
            });

            const results = simulateHpp(boms, overrides);

            return serializeData(results);
        });
    }
);
