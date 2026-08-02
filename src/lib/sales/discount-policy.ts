/**
 * Discount ceiling — pure, testable policy.
 *
 * Customer override wins over tenant-wide ceiling.
 * No ceiling (both null) = always allowed (backward-compat behavior — Section 4.3 Data Patch).
 * Boundary inclusive: discount exactly at ceiling is allowed.
 */

// ── AppSetting key for tenant-wide default ceiling ─────────────────────
export const DISCOUNT_CEILING_SETTING_KEY =
    'sales.discountCeilingPercent' as const;

export type DiscountCeilingInput = {
    /** Per-item or total discount percent being applied. */
    discountPercent: number;
    /** Per-customer override. null = no per-customer ceiling. */
    customerCeiling: number | null;
    /** Tenant-wide default ceiling from AppSetting. null = no tenant ceiling. */
    tenantCeiling: number | null;
};

export type DiscountCeilingResult = {
    /** Whether the discount is within the ceiling. */
    allowed: boolean;
    /** How far over the ceiling (0 when allowed). */
    exceededBy: number;
    /** Ceiling that was actually applied (null = none). */
    appliedCeiling: number | null;
};

export function checkDiscountCeiling(
    input: DiscountCeilingInput,
): DiscountCeilingResult {
    const appliedCeiling =
        input.customerCeiling != null
            ? input.customerCeiling
            : input.tenantCeiling != null
              ? input.tenantCeiling
              : null;

    if (appliedCeiling == null) {
        return { allowed: true, exceededBy: 0, appliedCeiling: null };
    }

    // Inclusive — exactly at ceiling is still allowed
    const allowed = input.discountPercent <= appliedCeiling;
    const exceededBy = allowed ? 0 : input.discountPercent - appliedCeiling;

    return { allowed, exceededBy, appliedCeiling };
}
