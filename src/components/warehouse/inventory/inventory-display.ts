import { sumQuantities } from '@/lib/utils/utils';
import type { InventoryItem } from './inventory-table-types';

/** Display fallback only: do not recompute reservation/costing rules here. */
export function availableStock(item: {
    quantity: number;
    availableQuantity?: number | null;
}) {
    return item.availableQuantity ?? item.quantity;
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
