type InventoryCostLike = {
    quantity?: unknown;
    averageCost?: unknown;
};

export type VariantCostLike = {
    currentCost?: unknown;
    standardCost?: unknown;
    buyPrice?: unknown;
    price?: unknown;
    inventories?: InventoryCostLike[];
};

export type CostSource = 'explicit_current_cost' | 'inventory_average' | 'standard_cost' | 'buy_price' | 'price' | 'zero';
export type CostAnomalyFlag = 'inventory_standard_gap' | 'low_stock_cost_outlier';

export type CurrentCostBreakdown = {
    currentCost: number;
    source: CostSource;
    stockQty: number;
    stockValue: number;
    standardCost: number;
    buyPrice: number;
    price: number;
};

export type VariantCostDiagnostics = {
    breakdown: CurrentCostBreakdown;
    flags: CostAnomalyFlag[];
    gapPercent: number | null;
};

export function asNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (typeof value === 'object' && value !== null && 'toNumber' in value && typeof value.toNumber === 'function') {
        return value.toNumber();
    }
    if (typeof value === 'object' && value !== null && 'valueOf' in value && typeof value.valueOf === 'function') {
        return Number(value.valueOf());
    }
    return Number(value);
}

export function getCurrentCostBreakdown(variant?: VariantCostLike | null): CurrentCostBreakdown {
    if (!variant) {
        return {
            currentCost: 0,
            source: 'zero',
            stockQty: 0,
            stockValue: 0,
            standardCost: 0,
            buyPrice: 0,
            price: 0,
        };
    }

    const explicitCurrentCost = asNumber(variant.currentCost);
    const standardCost = asNumber(variant.standardCost);
    const buyPrice = asNumber(variant.buyPrice);
    const price = asNumber(variant.price);
    const inventories = variant.inventories || [];
    const stockValue = inventories.reduce((sum, inventory) => {
        return sum + (asNumber(inventory.quantity) * asNumber(inventory.averageCost));
    }, 0);
    const stockQty = inventories.reduce((sum, inventory) => sum + asNumber(inventory.quantity), 0);

    if (explicitCurrentCost > 0) {
        return {
            currentCost: explicitCurrentCost,
            source: 'explicit_current_cost',
            stockQty,
            stockValue,
            standardCost,
            buyPrice,
            price,
        };
    }

    if (stockQty > 0 && stockValue > 0) {
        return {
            currentCost: stockValue / stockQty,
            source: 'inventory_average',
            stockQty,
            stockValue,
            standardCost,
            buyPrice,
            price,
        };
    }

    if (standardCost > 0) {
        return {
            currentCost: standardCost,
            source: 'standard_cost',
            stockQty,
            stockValue,
            standardCost,
            buyPrice,
            price,
        };
    }

    if (buyPrice > 0) {
        return {
            currentCost: buyPrice,
            source: 'buy_price',
            stockQty,
            stockValue,
            standardCost,
            buyPrice,
            price,
        };
    }

    if (price > 0) {
        return {
            currentCost: price,
            source: 'price',
            stockQty,
            stockValue,
            standardCost,
            buyPrice,
            price,
        };
    }

    return {
        currentCost: 0,
        source: 'zero',
        stockQty,
        stockValue,
        standardCost,
        buyPrice,
        price,
    };
}

export function getCostAnomalyFlags(breakdown: Pick<CurrentCostBreakdown, 'currentCost' | 'standardCost' | 'source' | 'stockQty' | 'stockValue'>): CostAnomalyFlag[] {
    const flags = new Set<CostAnomalyFlag>();

    const hasMeaningfulStandard = breakdown.standardCost > 0;
    const gapRatio = hasMeaningfulStandard
        ? Math.abs(breakdown.currentCost - breakdown.standardCost) / breakdown.standardCost
        : 0;

    if (hasMeaningfulStandard && gapRatio >= 0.2) {
        flags.add('inventory_standard_gap');
    }

    if (
        breakdown.source === 'inventory_average' &&
        breakdown.stockQty > 0 &&
        breakdown.stockQty <= 2 &&
        hasMeaningfulStandard &&
        gapRatio >= 0.2 &&
        breakdown.stockValue > 0
    ) {
        flags.add('low_stock_cost_outlier');
    }

    return Array.from(flags);
}

export function getVariantCostDiagnostics(variant?: VariantCostLike | null): VariantCostDiagnostics {
    const breakdown = getCurrentCostBreakdown(variant);
    const flags = getCostAnomalyFlags(breakdown);
    const gapPercent = breakdown.standardCost > 0
        ? ((breakdown.currentCost - breakdown.standardCost) / breakdown.standardCost) * 100
        : null;

    return {
        breakdown,
        flags,
        gapPercent,
    };
}

export function getCurrentUnitCost(variant?: VariantCostLike | null): number {
    return getCurrentCostBreakdown(variant).currentCost;
}

export function calculateBomItemCost(item: {
    quantity?: unknown;
    scrapPercentage?: unknown;
    productVariant?: VariantCostLike | null;
}): number {
    const unitCost = getCurrentUnitCost(item.productVariant);
    const quantity = asNumber(item.quantity);
    const scrapMultiplier = 1 + (asNumber(item.scrapPercentage) / 100);

    return unitCost * quantity * scrapMultiplier;
}
