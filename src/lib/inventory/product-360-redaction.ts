/**
 * Server-side redaction for the product 360 view. Used for roles that may follow
 * stock but must not see valuation (read-only Kepala Pabrik). Every helper
 * returns a new object; the value is the payload sent to the client, so a
 * redacted field must be nulled/zeroed here rather than hidden in the UI.
 */

const VARIANT_PRICE_KEYS = [
    'price',
    'buyPrice',
    'sellPrice',
    'standardCost',
] as const;

type VariantPriceKey = (typeof VARIANT_PRICE_KEYS)[number];

function withNulledFields<T extends object, K extends keyof T>(
    source: T,
    keys: readonly K[],
): T {
    const nulls = Object.fromEntries(keys.map((key) => [key, null]));
    return { ...source, ...nulls } as T;
}

export function redactVariantPrices<T extends Record<VariantPriceKey, unknown>>(
    variant: T,
): T {
    return withNulledFields(variant, VARIANT_PRICE_KEYS);
}

export function redactInventoryCost<T extends { averageCost: unknown }>(
    row: T,
): T {
    return withNulledFields(row, ['averageCost'] as const);
}

export function redactMovementCost<T extends { cost: unknown }>(row: T): T {
    return withNulledFields(row, ['cost'] as const);
}

interface Product360OverviewShape {
    variant: Record<VariantPriceKey, unknown>;
    totalValue: number;
    inventories: { averageCost: unknown }[];
    costHistory: unknown[];
}

export function redactProduct360Overview<T extends Product360OverviewShape>(
    overview: T,
): T {
    return {
        ...overview,
        variant: redactVariantPrices(overview.variant),
        totalValue: 0,
        inventories: overview.inventories.map(redactInventoryCost),
        costHistory: [],
    };
}
