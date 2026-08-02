/**
 * Single source of truth for route compliance calculation.
 * Extracted from inline formula in route-plans.ts and reused by
 * visit-supervision-service.
 */

export type ComplianceInput = {
    assigned: number;
    visited: number;
    extraCalls: number;
};

/**
 * Calculate compliance percentage: (visited - extraCalls) / assigned * 100
 * Returns 0 when assigned === 0 to avoid NaN/Infinity.
 * Rounded to nearest integer, matching prior behavior.
 */
export function calculateComplianceRate({
    assigned,
    visited,
    extraCalls,
}: ComplianceInput): number {
    if (assigned === 0) return 0;
    return Math.round(((visited - extraCalls) / assigned) * 100);
}

// — Helpers for reviewStatus decision per Q1 —

export const REVIEW_PENDING_REASONS = [
    'TOKO_BARU',
    'PERMINTAAN_DADAKAN',
] as const;
export type ReviewPendingReason = (typeof REVIEW_PENDING_REASONS)[number];

export function isReviewPendingReason(
    reason: string | null | undefined,
): boolean {
    if (!reason) return false;
    return (REVIEW_PENDING_REASONS as readonly string[]).includes(reason);
}

/**
 * Determine initial reviewStatus for a newly synced visit.
 * Only extraCall + TOKO_BARU/PERMINTAAN_DADAKAN → PENDING, else NOT_REQUIRED.
 */
export function getInitialReviewStatus(input: {
    isExtraCall: boolean;
    extraReason?: string | null;
}): 'PENDING' | 'NOT_REQUIRED' {
    if (input.isExtraCall && isReviewPendingReason(input.extraReason)) {
        return 'PENDING';
    }
    return 'NOT_REQUIRED';
}
