import type { InventoryItem } from './inventory-table-types';

/** Display fallback only: do not recompute reservation/costing rules here. */
export function availableStock(item: {
    quantity: number;
    availableQuantity?: number | null;
}) {
    return item.availableQuantity ?? item.quantity;
}

export function stockTotalsByUnit(items: InventoryItem[]) {
    return items.reduce<Record<string, number>>((totals, item) => {
        const unit = item.productVariant.primaryUnit;
        totals[unit] = (totals[unit] ?? 0) + item.quantity;
        return totals;
    }, {});
}
