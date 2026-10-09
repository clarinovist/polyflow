export const WAREHOUSE_SLUGS = {
    RAW_MATERIAL: 'rm_warehouse',
    FINISHING: 'fg_warehouse',
    SCRAP: 'scrap_warehouse',
    MIXING: 'mixing_area',
    PACKING_AREA: 'packing_area',
    WIP_STORAGE: 'wip_storage',
    CUSTOMER_OWNED: 'customer_owned_storage',
} as const;

export const MAKLON_STAGE_SLUGS = {
    RAW_MATERIAL: 'maklon_raw_material',
    WIP: 'maklon_wip',
    FINISHED_GOOD: 'maklon_fg',
    PACKING: 'maklon_packing',
} as const;

/**
 * Locations counted toward the low-stock alert threshold: internal Raw
 * Material + Finished Goods warehouses. Tenant slugs vary (canonical
 * `rm_warehouse`/`fg_warehouse` vs. other tenants' own naming), so this
 * matches on locationPurpose scoped to INTERNAL — never
 * customer-owned/maklon stock (see docs/plan/2026-08-10-fix-lowstock-badge-slug-mismatch.md).
 */
export interface StockScopeLocation {
    locationType?: string | null;
    locationPurpose?: string | null;
}

export function isLowStockAlertLocation(
    loc?: StockScopeLocation | null,
): boolean {
    if (!loc || loc.locationType !== 'INTERNAL') return false;
    return (
        loc.locationPurpose === 'RAW_MATERIAL' ||
        loc.locationPurpose === 'FINISHED_GOOD'
    );
}

function stockScopeNumber(value: unknown): number {
    if (
        value &&
        typeof value === 'object' &&
        'toNumber' in value &&
        typeof (value as { toNumber?: unknown }).toNumber === 'function'
    ) {
        const converted = (value as { toNumber: () => number }).toNumber();
        return Number.isFinite(converted) ? converted : 0;
    }
    const converted = Number(value ?? 0);
    return Number.isFinite(converted) ? converted : 0;
}

export function sumInventoryAlertQuantity(
    inventories: ReadonlyArray<{
        quantity: unknown;
        location?: StockScopeLocation | null;
    }>,
): number {
    return inventories.reduce((sum, inventory) => {
        if (!isLowStockAlertLocation(inventory.location)) return sum;
        return sum + stockScopeNumber(inventory.quantity);
    }, 0);
}

export function isInventoryThresholdTriggered(
    inventories: ReadonlyArray<{
        quantity: unknown;
        location?: StockScopeLocation | null;
    }>,
    threshold: unknown,
): boolean {
    const thresholdValue = stockScopeNumber(threshold);
    return (
        Number.isFinite(thresholdValue) &&
        thresholdValue > 0 &&
        sumInventoryAlertQuantity(inventories) < thresholdValue
    );
}
