import {
    commonStatusLabels,
    productionStatusLabels,
    productionPriorityLabels,
    warehouseStatusLabels,
    salesStatusLabels,
    financeStatusLabels,
    purchasingStatusLabels,
} from './status';
export type StatusDomain =
    | 'production'
    | 'warehouse'
    | 'sales'
    | 'finance'
    | 'purchasing';

const domainMap: Record<StatusDomain, Record<string, string>> = {
    production: productionStatusLabels as Record<string, string>,
    warehouse: warehouseStatusLabels as Record<string, string>,
    sales: salesStatusLabels as Record<string, string>,
    finance: financeStatusLabels as Record<string, string>,
    purchasing: purchasingStatusLabels as Record<string, string>,
};

/**
 * Status helper with explicit domain parameter.
 * Domain-specific labels take priority; falls back to commonStatusLabels.
 */
export function getStatusLabel(status: string, domain?: StatusDomain): string {
    if (domain && status in domainMap[domain]) {
        return domainMap[domain][status];
    }
    return (commonStatusLabels as Record<string, string>)[status] ?? status;
}

export function getPriorityLabel(priority: string): string {
    return (
        (productionPriorityLabels as Record<string, string>)[priority] ??
        priority
    );
}
