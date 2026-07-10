/**
 * Pure delivery pricing helpers.
 * No DB, no side effects — fully testable in isolation.
 *
 * Used by:
 * - vehicle-tariffs.ts (overlap check, resolve active tariff)
 * - deliveries.ts (create/update DO with computed totals)
 * - delivery-schedules.ts (assign schedule → snapshot totals)
 * - delivery-shipping-sync.ts (sum billable charges → SO)
 * - UI components (client-side preview mirror)
 */

export type RateTypeInput = 'PER_KG' | 'FLAT_RATE';

export interface DeliveryTotalsInput {
  rateType: RateTypeInput;
  costRate: number;
  chargeRate: number;
  weightKg?: number | null;
  minKg?: number | null;
}

export interface DeliveryTotals {
  totalCost: number;
  totalCharge: number;
  billableKg: number | null;
}

/**
 * Normalize a route name for comparison.
 * null / undefined / "" / whitespace-only → null (means "Semua Rute").
 * Otherwise: trimmed.
 */
export function normalizeRouteKey(
  routeName?: string | null,
): string | null {
  if (routeName == null) return null;
  const trimmed = routeName.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Compare two route names for exact match (after normalization).
 * null matches null (both = "Semua Rute").
 */
export function routesMatch(
  a?: string | null,
  b?: string | null,
): boolean {
  return normalizeRouteKey(a) === normalizeRouteKey(b);
}

/**
 * Compute delivery cost/charge totals from rates and weight.
 *
 * Rules:
 * - FLAT_RATE: totalCost = costRate, totalCharge = chargeRate, billableKg = null
 * - PER_KG with weight/min > 0: billableKg = max(weightKg, minKg), multiply by rates
 * - PER_KG with weight 0/null and min 0/null: totals = 0, billableKg = 0
 *
 * All monetary values rounded to 2 decimal places (Math.round x*100 /100).
 */
export function computeDeliveryTotals(input: DeliveryTotalsInput): DeliveryTotals {
  const { rateType, costRate, chargeRate } = input;

  if (rateType === 'FLAT_RATE') {
    return {
      totalCost: round2(costRate),
      totalCharge: round2(chargeRate),
      billableKg: null,
    };
  }

  // PER_KG
  const weight = input.weightKg != null && input.weightKg > 0 ? input.weightKg : 0;
  const minKg = input.minKg != null && input.minKg > 0 ? input.minKg : 0;
  const billableKg = Math.max(weight, minKg);

  return {
    totalCost: round2(billableKg * costRate),
    totalCharge: round2(billableKg * chargeRate),
    billableKg,
  };
}

/**
 * Check if a delivery status is billable (should be included in SO shipping sum).
 * Default policy: all statuses except CANCELLED are billable.
 * RETURNED is included per product decision A2.
 */
export function isBillableDeliveryStatus(status: string): boolean {
  return status !== 'CANCELLED';
}

/**
 * Sum the totalCharge of billable deliveries.
 * Skips CANCELLED and entries with null/undefined totalCharge.
 */
export function sumBillableCharges(
  deliveries: Array<{ status: string; totalCharge: number | null | undefined }>,
): number {
  let sum = 0;
  for (const d of deliveries) {
    if (!isBillableDeliveryStatus(d.status)) continue;
    if (d.totalCharge != null) {
      sum += Number(d.totalCharge);
    }
  }
  return round2(sum);
}

/**
 * Round to 2 decimal places (IDR with sen precision).
 * Matches project convention: Math.round(x * 100) / 100.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
