import { asNumber, getCurrentUnitCost } from '@/lib/utils/current-cost';

export type PriceOverrides = Record<string, number>;

type InventoryCostLike = {
    quantity?: unknown;
    averageCost?: unknown;
};

type ProductInfoLike = {
    name?: string | null;
};

type VariantCostLike = {
    id: string;
    name: string;
    skuCode: string;
    currentCost?: unknown;
    standardCost?: unknown;
    buyPrice?: unknown;
    price?: unknown;
    inventories?: InventoryCostLike[];
    product?: ProductInfoLike | null;
};

type BomItemSource = {
    id: string;
    productVariantId: string;
    quantity?: unknown;
    scrapPercentage?: unknown;
    productVariant?: VariantCostLike | null;
};

type BomSource = {
    id: string;
    name: string;
    category?: unknown;
    outputQuantity?: unknown;
    productVariantId: string;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        product?: ProductInfoLike | null;
    };
    items: BomItemSource[];
};

export type SimulatorMaterial = {
    id: string;
    name: string;
    skuCode: string;
    productName: string;
    currentPrice: number;
};

export type SimulatorBomItem = {
    id: string;
    productVariantId: string;
    quantity: number;
    scrapPercentage: number;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        productName: string;
        currentCost: number;
    };
};

export type SimulatorBom = {
    id: string;
    name: string;
    category: string;
    outputQuantity: number;
    productVariantId: string;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        productName: string;
    };
    items: SimulatorBomItem[];
    currentUnitCost: number;
};

export type SimulatorBomImpact = {
    id: string;
    name: string;
    category: string;
    outputQuantity: number;
    productVariantId: string;
    productVariantName: string;
    productVariantSku: string;
    currentUnitCost: number;
    simulatedUnitCost: number;
    varianceAmount: number;
    variancePercent: number;
};

export type BomSimulationDataset = {
    materials: SimulatorMaterial[];
    boms: SimulatorBom[];
};

function getValidOverride(overrides: PriceOverrides, productVariantId: string): number | null {
    const override = overrides[productVariantId];
    if (typeof override !== 'number' || Number.isNaN(override) || !Number.isFinite(override) || override < 0) {
        return null;
    }

    return override;
}

function calculateSimulatedItemCost(item: SimulatorBomItem, overrides: PriceOverrides): number {
    const override = getValidOverride(overrides, item.productVariantId);
    const unitCost = override ?? item.productVariant.currentCost;
    const scrapMultiplier = 1 + (item.scrapPercentage / 100);

    return unitCost * item.quantity * scrapMultiplier;
}

export function calculateSimulatedBomUnitCost(bom: SimulatorBom, overrides: PriceOverrides = {}): number {
    const totalCost = bom.items.reduce((sum, item) => sum + calculateSimulatedItemCost(item, overrides), 0);

    if (bom.outputQuantity <= 0) {
        return totalCost;
    }

    return totalCost / bom.outputQuantity;
}

export function normalizeSimulationBoms(boms: BomSource[]): SimulatorBom[] {
    return boms.map((bom) => {
        const normalizedItems = bom.items.map((item) => ({
            id: item.id,
            productVariantId: item.productVariantId,
            quantity: asNumber(item.quantity),
            scrapPercentage: asNumber(item.scrapPercentage),
            productVariant: {
                id: item.productVariant?.id ?? item.productVariantId,
                name: item.productVariant?.name ?? 'Unknown Material',
                skuCode: item.productVariant?.skuCode ?? '-',
                productName: item.productVariant?.product?.name ?? '-',
                currentCost: getCurrentUnitCost(item.productVariant),
            },
        }));

        const normalizedBom: SimulatorBom = {
            id: bom.id,
            name: bom.name,
            category: String(bom.category ?? 'STANDARD'),
            outputQuantity: asNumber(bom.outputQuantity) || 1,
            productVariantId: bom.productVariantId,
            productVariant: {
                id: bom.productVariant.id,
                name: bom.productVariant.name,
                skuCode: bom.productVariant.skuCode,
                productName: bom.productVariant.product?.name ?? '-',
            },
            items: normalizedItems,
            currentUnitCost: 0,
        };

        normalizedBom.currentUnitCost = calculateSimulatedBomUnitCost(normalizedBom);

        return normalizedBom;
    });
}

export function extractSimulationMaterials(boms: SimulatorBom[]): SimulatorMaterial[] {
    const materialMap = new Map<string, SimulatorMaterial>();

    for (const bom of boms) {
        for (const item of bom.items) {
            if (!materialMap.has(item.productVariantId)) {
                materialMap.set(item.productVariantId, {
                    id: item.productVariantId,
                    name: item.productVariant.name,
                    skuCode: item.productVariant.skuCode,
                    productName: item.productVariant.productName,
                    currentPrice: item.productVariant.currentCost,
                });
            }
        }
    }

    return Array.from(materialMap.values()).sort((left, right) => {
        const productCompare = left.productName.localeCompare(right.productName);
        if (productCompare !== 0) {
            return productCompare;
        }

        return left.name.localeCompare(right.name);
    });
}

export function buildBomSimulationDataset(bomSources: BomSource[]): BomSimulationDataset {
    const boms = normalizeSimulationBoms(bomSources);

    return {
        materials: extractSimulationMaterials(boms),
        boms,
    };
}

export function simulateBomCosts(boms: SimulatorBom[], overrides: PriceOverrides = {}): SimulatorBomImpact[] {
    return boms.map((bom) => {
        const simulatedUnitCost = calculateSimulatedBomUnitCost(bom, overrides);
        const varianceAmount = simulatedUnitCost - bom.currentUnitCost;
        const variancePercent = bom.currentUnitCost > 0
            ? (varianceAmount / bom.currentUnitCost) * 100
            : 0;

        return {
            id: bom.id,
            name: bom.name,
            category: bom.category,
            outputQuantity: bom.outputQuantity,
            productVariantId: bom.productVariantId,
            productVariantName: bom.productVariant.name,
            productVariantSku: bom.productVariant.skuCode,
            currentUnitCost: bom.currentUnitCost,
            simulatedUnitCost,
            varianceAmount,
            variancePercent,
        };
    });
}