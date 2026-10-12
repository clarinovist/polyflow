import { isLowStockAlertLocation } from '@/lib/constants/locations';
import { sumQuantities, toDecimalNumber } from '@/lib/utils/utils';
import type { InventoryItem } from './inventory-table-types';

type StockAlertItem = {
    productVariantId: string;
    quantity: unknown;
    location?: {
        locationType?: string | null;
        locationPurpose?: string | null;
    } | null;
};

/** Display fallback only: do not recompute reservation/costing rules here. */
export function availableStock(item: {
    quantity: number;
    availableQuantity?: number | null;
}) {
    return item.availableQuantity ?? item.quantity;
}

export function stockAlertTotalsByVariant(
    items: ReadonlyArray<StockAlertItem>,
): Record<string, number> {
    const quantitiesByVariant = new Map<string, number[]>();

    for (const item of items) {
        const quantities = quantitiesByVariant.get(item.productVariantId) ?? [];
        quantitiesByVariant.set(item.productVariantId, quantities);
        if (!isLowStockAlertLocation(item.location)) continue;
        quantities.push(toDecimalNumber(item.quantity));
    }

    return Object.fromEntries(
        Array.from(quantitiesByVariant, ([id, quantities]) => [
            id,
            sumQuantities(quantities),
        ]),
    );
}

export function stockTotalsByUnit(items: InventoryItem[]) {
    const quantitiesByUnit = new Map<string, number[]>();

    for (const item of items) {
        const unit = item.productVariant.primaryUnit;
        const quantities = quantitiesByUnit.get(unit) ?? [];
        quantities.push(item.quantity);
        quantitiesByUnit.set(unit, quantities);
    }

    return Object.fromEntries(
        Array.from(quantitiesByUnit, ([unit, quantities]) => [
            unit,
            sumQuantities(quantities),
        ]),
    );
}
