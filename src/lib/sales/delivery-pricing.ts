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
 * Generic normalizer for optional string keys.
 * null / undefined / "" / whitespace-only → null.
 * Otherwise: trimmed.
 */
export function normalizeKey(v?: string | null): string | null {
    if (v == null) return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalize a route name for comparison.
 * Thin wrapper over normalizeKey — kept for backward compat.
 */
export function normalizeRouteKey(routeName?: string | null): string | null {
    return normalizeKey(routeName);
}

/**
 * Compare two route names for exact match (after normalization).
 * null matches null (both = "Semua Rute").
 */
export function routesMatch(a?: string | null, b?: string | null): boolean {
    return normalizeRouteKey(a) === normalizeRouteKey(b);
}

/**
 * Compare two customer IDs for exact match.
 * null matches null (both = "Semua Customer").
 */
export function customersMatch(
    a?: string | null,
    b?: string | null,
): boolean {
    return normalizeKey(a) === normalizeKey(b);
}

// ── Tariff Precedence Types ──────────────────────────────

export interface TariffCandidate {
    customerId?: string | null;
    routeName?: string | null;
}

export interface TariffResolutionInput {
    routeName?: string | null;
    customerId?: string | null;
}

/**
 * Resolve the best tariff from candidates based on customer + route precedence:
 * 1. customer match + route match (most specific)
 * 2. customer match + route null (customer-specific, all routes)
 * 3. customer null + route match (all customers, specific route)
 * 4. customer null + route null (default — all customers, all routes)
 *
 * Within each tier, the most recently valid tariff wins (candidates should be
 * ordered by validFrom desc). Returns undefined if no candidates provided.
 */
export function resolveBestTariff<T extends TariffCandidate>(
    candidates: T[],
    input: TariffResolutionInput,
): T | undefined {
    const routeKey = normalizeRouteKey(input.routeName);
    const custKey = normalizeKey(input.customerId);

    const customerMatch = (t: TariffCandidate) =>
        normalizeKey(t.customerId) === custKey;
    const routeMatch = (t: TariffCandidate) =>
        normalizeRouteKey(t.routeName) === routeKey;
    const customerNull = (t: TariffCandidate) =>
        normalizeKey(t.customerId) === null;
    const routeNull = (t: TariffCandidate) =>
        normalizeRouteKey(t.routeName) === null;

    // Tier 1: customer match + route match
    const tier1 = candidates.find(
        (t) => customerMatch(t) && routeMatch(t),
    );
    if (tier1) return tier1;

    // Tier 2: customer match + route null (all routes)
    const tier2 = candidates.find(
        (t) => customerMatch(t) && routeNull(t),
    );
    if (tier2) return tier2;

    // Tier 3: customer null + route match
    const tier3 = candidates.find(
        (t) => customerNull(t) && routeMatch(t),
    );
    if (tier3) return tier3;

    // Tier 4: customer null + route null (default)
    const tier4 = candidates.find(
        (t) => customerNull(t) && routeNull(t),
    );
    if (tier4) return tier4;

    return undefined;
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
export function computeDeliveryTotals(
    input: DeliveryTotalsInput,
): DeliveryTotals {
    const { rateType, costRate, chargeRate } = input;

    if (rateType === 'FLAT_RATE') {
        return {
            totalCost: round2(costRate),
            totalCharge: round2(chargeRate),
            billableKg: null,
        };
    }

    // PER_KG
    const weight =
        input.weightKg != null && input.weightKg > 0 ? input.weightKg : 0;
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
    deliveries: Array<{
        status: string;
        totalCharge: number | null | undefined;
    }>,
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
