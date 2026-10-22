/**
 * Floor-stock status shown on the production portal. Zero is "Habis", not a
 * restock hint, so one depleted row never looks like every other warning.
 * The low-stock threshold is the product's own `minStockAlert` when it is
 * filled; otherwise a 25 kg default (a proposal, not a tenant setting).
 */

export const LOW_STOCK_THRESHOLD_KG = 25;

export type StockLevel = 'DEPLETED' | 'LOW' | 'OK';

export const STOCK_LEVEL_LABEL: Readonly<Record<StockLevel, string>> =
    Object.freeze({
        DEPLETED: 'Habis',
        LOW: 'Menipis',
        OK: 'Aman',
    });

export function classifyStockLevel(
    quantity: number | null | undefined,
    lowThreshold: number = LOW_STOCK_THRESHOLD_KG,
): StockLevel {
    if (quantity === null || quantity === undefined) return 'DEPLETED';
    if (!Number.isFinite(quantity) || quantity <= 0) return 'DEPLETED';
    return quantity < lowThreshold ? 'LOW' : 'OK';
}

/** Product minimum when usable (a positive number), otherwise the default. */
export function resolveLowStockThreshold(minStockAlert: unknown): number {
    if (minStockAlert === null || minStockAlert === undefined) {
        return LOW_STOCK_THRESHOLD_KG;
    }
    const value = Number(String(minStockAlert));
    return Number.isFinite(value) && value > 0 ? value : LOW_STOCK_THRESHOLD_KG;
}

export function classifyStockRow(row: {
    quantity: number | null | undefined;
    minStockAlert: unknown;
}): StockLevel {
    return classifyStockLevel(
        row.quantity,
        resolveLowStockThreshold(row.minStockAlert),
    );
}

export function countStockLevels(
    levels: ReadonlyArray<StockLevel>,
): Record<StockLevel, number> {
    const counts: Record<StockLevel, number> = { DEPLETED: 0, LOW: 0, OK: 0 };
    for (const level of levels) counts[level] += 1;
    return counts;
}
