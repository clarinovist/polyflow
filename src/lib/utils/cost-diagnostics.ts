import type { CostAnomalyFlag, CostSource } from './current-cost';

export type CostBadgeTone = 'default' | 'secondary' | 'destructive' | 'outline';

export function getCostSourceLabel(source: CostSource): string {
    switch (source) {
        case 'explicit_current_cost':
            return 'Manual Current Cost';
        case 'inventory_average':
            return 'Inventory Avg';
        case 'standard_cost':
            return 'Standard Cost';
        case 'buy_price':
            return 'Buy Price';
        case 'price':
            return 'Sell Price Fallback';
        case 'zero':
        default:
            return 'No Cost Basis';
    }
}

export function getCostSourceTone(source: CostSource): CostBadgeTone {
    switch (source) {
        case 'inventory_average':
        case 'explicit_current_cost':
            return 'default';
        case 'standard_cost':
        case 'buy_price':
            return 'secondary';
        case 'price':
        case 'zero':
        default:
            return 'outline';
    }
}

export function getCostAlertMessage(flag: CostAnomalyFlag): string {
    switch (flag) {
        case 'low_stock_cost_outlier':
            return 'Current cost datang dari stok tipis, jadi angka bisa terdistorsi residue cost lama.';
        case 'inventory_standard_gap':
        default:
            return 'Current cost berbeda jauh dari standard cost. Review residue stock, setup BOM, atau timing recalc.';
    }
}

export function getCostAlertShortLabel(flag: CostAnomalyFlag): string {
    switch (flag) {
        case 'low_stock_cost_outlier':
            return 'Low Stock Outlier';
        case 'inventory_standard_gap':
        default:
            return 'Std Gap';
    }
}

export function getCostGapPercent(currentCost: number, standardCost: number): number | null {
    if (standardCost <= 0) return null;
    return ((currentCost - standardCost) / standardCost) * 100;
}

export function formatCostGapLabel(currentCost: number, standardCost: number): string | null {
    const gapPercent = getCostGapPercent(currentCost, standardCost);
    if (gapPercent === null) return null;

    return `${gapPercent >= 0 ? '+' : ''}${gapPercent.toFixed(1)}% vs std`;
}

export function getCostHealthTone(flags: CostAnomalyFlag[]): CostBadgeTone {
    return flags.length > 0 ? 'destructive' : 'secondary';
}

export function getCostHealthLabel(flags: CostAnomalyFlag[]): string {
    return flags.length > 0 ? 'Review Needed' : 'Within Range';
}
