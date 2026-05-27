import {
  commonStatusLabels,
  productionStatusLabels,
  warehouseStatusLabels,
  salesStatusLabels,
  financeStatusLabels,
} from './status';

/** Fallback helper: returns mapped label or raw value if not found */
export function getLabel<T extends Record<string, string>>(
  map: T,
  key: string
): string {
  return (map as Record<string, string>)[key] ?? key;
}

export type StatusDomain = 'production' | 'warehouse' | 'sales' | 'finance';

const domainMap: Record<StatusDomain, Record<string, string>> = {
  production: productionStatusLabels as Record<string, string>,
  warehouse: warehouseStatusLabels as Record<string, string>,
  sales: salesStatusLabels as Record<string, string>,
  finance: financeStatusLabels as Record<string, string>,
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
