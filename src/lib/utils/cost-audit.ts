import {
    getVariantCostDiagnostics,
    type CostAnomalyFlag,
    type CostSource,
    type VariantCostLike,
} from './current-cost';

export type CostAuditVariantLike = VariantCostLike & {
    id: string;
    name: string;
    skuCode: string;
    product?: {
        name?: string | null;
    } | null;
};

export type CostAuditRow = {
    variantId: string;
    variantName: string;
    skuCode: string;
    productName: string;
    currentCost: number;
    standardCost: number;
    stockQty: number;
    stockValue: number;
    source: CostSource;
    gapPercent: number | null;
    flags: CostAnomalyFlag[];
    inventoryCount: number;
    health: 'review_needed' | 'within_range';
};

export type CostAuditFilters = {
    anomalyOnly?: boolean;
    source?: CostSource | 'all';
    flag?: CostAnomalyFlag | 'all';
};

export type CostAuditSummary = {
    totalVariants: number;
    reviewNeeded: number;
    lowStockOutliers: number;
    inventoryStandardGaps: number;
    inventoryAverageCount: number;
    standardFallbackCount: number;
};

export function buildCostAuditRows(
    variants: CostAuditVariantLike[],
    filters: CostAuditFilters = {}
): CostAuditRow[] {
    return variants
        .map((variant) => {
            const diagnostics = getVariantCostDiagnostics(variant);

            return {
                variantId: variant.id,
                variantName: variant.name,
                skuCode: variant.skuCode,
                productName: variant.product?.name || '-',
                currentCost: diagnostics.breakdown.currentCost,
                standardCost: diagnostics.breakdown.standardCost,
                stockQty: diagnostics.breakdown.stockQty,
                stockValue: diagnostics.breakdown.stockValue,
                source: diagnostics.breakdown.source,
                gapPercent: diagnostics.gapPercent,
                flags: diagnostics.flags,
                inventoryCount: variant.inventories?.length || 0,
                health: diagnostics.flags.length > 0 ? 'review_needed' : 'within_range',
            } satisfies CostAuditRow;
        })
        .filter((row) => {
            if (filters.anomalyOnly && row.flags.length === 0) return false;
            if (filters.source && filters.source !== 'all' && row.source !== filters.source) return false;
            if (filters.flag && filters.flag !== 'all' && !row.flags.includes(filters.flag)) return false;
            return true;
        })
        .sort((left, right) => {
            if (right.flags.length !== left.flags.length) return right.flags.length - left.flags.length;
            const leftGap = Math.abs(left.gapPercent || 0);
            const rightGap = Math.abs(right.gapPercent || 0);
            if (rightGap !== leftGap) return rightGap - leftGap;
            return left.variantName.localeCompare(right.variantName);
        });
}

export function summarizeCostAuditRows(rows: CostAuditRow[]): CostAuditSummary {
    return {
        totalVariants: rows.length,
        reviewNeeded: rows.filter((row) => row.flags.length > 0).length,
        lowStockOutliers: rows.filter((row) => row.flags.includes('low_stock_cost_outlier')).length,
        inventoryStandardGaps: rows.filter((row) => row.flags.includes('inventory_standard_gap')).length,
        inventoryAverageCount: rows.filter((row) => row.source === 'inventory_average').length,
        standardFallbackCount: rows.filter((row) => row.source === 'standard_cost').length,
    };
}
