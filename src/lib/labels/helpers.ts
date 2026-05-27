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

/** Status helper with domain-specific fallback */
export function getStatusLabel(status: string): string {
  for (const map of [
    productionStatusLabels,
    warehouseStatusLabels,
    salesStatusLabels,
    financeStatusLabels,
  ]) {
    if (status in map) return (map as Record<string, string>)[status];
  }
  return (commonStatusLabels as Record<string, string>)[status] ?? status;
}
