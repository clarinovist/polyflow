import { asNumber } from '@/lib/utils/current-cost';

export type HppMaterialOverrides = Record<string, number>;

export interface HppBomItem {
    id: string;
    productVariantId: string;
    quantity: number;
    scrapPercentage: number;
    currentMaterialCost: number;
    productVariant: {
        id: string;
        name: string;
        skuCode: string;
        productName: string;
    };
}

export interface HppBom {
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
    items: HppBomItem[];
    /** Baseline material cost per unit (no overrides) */
    baselineMaterialPerUnit: number;
    /** Benchmark labor cost per unit from production history */
    benchmarkLaborPerUnit: number;
    /** Benchmark machine cost per unit from production history */
    benchmarkMachinePerUnit: number;
}

export interface HppOverrides {
    materialOverrides?: HppMaterialOverrides;
    laborPerUnit?: number;
    machinePerUnit?: number;
    overheadPerUnit?: number;
}

export interface HppBreakdown {
    materialCost: number;
    laborCost: number;
    machineCost: number;
    overheadCost: number;
    totalHpp: number;
}

export interface HppBomResult {
    bomId: string;
    bomName: string;
    category: string;
    outputQuantity: number;
    productVariantId: string;
    productVariantName: string;
    productVariantSku: string;
    baseline: HppBreakdown;
    simulated: HppBreakdown;
    varianceAmount: number;
    variancePercent: number;
}

export interface HppDataset {
    boms: HppBom[];
}

function getValidMaterialOverride(overrides: HppMaterialOverrides, productVariantId: string): number | null {
    const override = overrides[productVariantId];
    if (typeof override !== 'number' || !Number.isFinite(override) || Number.isNaN(override) || override < 0) {
        return null;
    }
    return override;
}

function calculateMaterialItemCost(item: HppBomItem, materialOverrides: HppMaterialOverrides): number {
    const override = getValidMaterialOverride(materialOverrides, item.productVariantId);
    const unitCost = override ?? item.currentMaterialCost;
    const scrapMultiplier = 1 + (item.scrapPercentage / 100);
    return unitCost * item.quantity * scrapMultiplier;
}

function calculateMaterialPerUnit(bom: HppBom, materialOverrides: HppMaterialOverrides): number {
    const totalMaterialCost = bom.items.reduce(
        (sum, item) => sum + calculateMaterialItemCost(item, materialOverrides),
        0
    );
    return bom.outputQuantity > 0 ? totalMaterialCost / bom.outputQuantity : totalMaterialCost;
}

/**
 * Calculate HPP per unit for a single BOM given overrides.
 * Pure function — no DB access.
 */
export function calculateHppUnit(bom: HppBom, overrides: HppOverrides = {}): HppBreakdown {
    const materialOverrides = overrides.materialOverrides ?? {};

    const materialCost = calculateMaterialPerUnit(bom, materialOverrides);

    const laborCost = asNumber(overrides.laborPerUnit) >= 0 && overrides.laborPerUnit !== undefined
        ? asNumber(overrides.laborPerUnit)
        : bom.benchmarkLaborPerUnit;

    const machineCost = asNumber(overrides.machinePerUnit) >= 0 && overrides.machinePerUnit !== undefined
        ? asNumber(overrides.machinePerUnit)
        : bom.benchmarkMachinePerUnit;

    const overheadCost = asNumber(overrides.overheadPerUnit) >= 0 && overrides.overheadPerUnit !== undefined
        ? asNumber(overrides.overheadPerUnit)
        : 0;

    const totalHpp = materialCost + laborCost + machineCost + overheadCost;

    return { materialCost, laborCost, machineCost, overheadCost, totalHpp };
}

/**
 * Calculate baseline HPP for a BOM (no overrides — uses benchmark and current material cost).
 */
export function calculateBaselineHpp(bom: HppBom): HppBreakdown {
    return calculateHppUnit(bom, {});
}

/**
 * Simulate HPP for all BOMs given uniform overrides (labor, machine, overhead) and per-material price overrides.
 */
export function simulateHpp(boms: HppBom[], overrides: HppOverrides): HppBomResult[] {
    return boms.map((bom) => {
        const baseline = calculateBaselineHpp(bom);
        const simulated = calculateHppUnit(bom, overrides);
        const varianceAmount = simulated.totalHpp - baseline.totalHpp;
        const variancePercent = baseline.totalHpp > 0 ? (varianceAmount / baseline.totalHpp) * 100 : 0;

        return {
            bomId: bom.id,
            bomName: bom.name,
            category: bom.category,
            outputQuantity: bom.outputQuantity,
            productVariantId: bom.productVariantId,
            productVariantName: bom.productVariant.name,
            productVariantSku: bom.productVariant.skuCode,
            baseline,
            simulated,
            varianceAmount,
            variancePercent,
        };
    });
}
