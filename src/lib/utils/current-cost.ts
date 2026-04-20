type InventoryCostLike = {
    quantity?: unknown;
    averageCost?: unknown;
};

type VariantCostLike = {
    currentCost?: unknown;
    standardCost?: unknown;
    buyPrice?: unknown;
    price?: unknown;
    inventories?: InventoryCostLike[];
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

export function getCurrentUnitCost(variant?: VariantCostLike | null): number {
    if (!variant) return 0;

    const explicitCurrentCost = asNumber(variant.currentCost);
    if (explicitCurrentCost > 0) return explicitCurrentCost;

    const inventories = variant.inventories || [];
    const stockValue = inventories.reduce((sum, inventory) => {
        return sum + (asNumber(inventory.quantity) * asNumber(inventory.averageCost));
    }, 0);
    const stockQty = inventories.reduce((sum, inventory) => sum + asNumber(inventory.quantity), 0);

    if (stockQty > 0) {
        return stockValue / stockQty;
    }

    return asNumber(variant.standardCost) || asNumber(variant.buyPrice) || asNumber(variant.price) || 0;
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
