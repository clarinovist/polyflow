/**
 * Business rejections that need a trace for operational or Finance review.
 * Returned without a stack trace, so log one line that admins can trace later.
 */
export const TRACEABLE_REJECTION_CODES: ReadonlySet<string> = new Set([
    'PRODUCTION_COST_PERIOD_INVALID',
    'PRODUCTION_WIP_UNRESOLVED',
    'PRODUCTION_WIP_MATERIAL_SHORTAGE',
    'PRODUCTION_CONVERSION_UNFUNDED',
    'PRODUCTION_COST_RECONCILIATION_REQUIRED',
    'PRODUCTION_REVERSAL_UNRESOLVED',
    'INTERNAL_USAGE_MISSING_MAPPING',
    'INTERNAL_USAGE_MISSING_COST',
    'INTERNAL_USAGE_MISSING_SOURCE_BASIS',
    'INTERNAL_USAGE_SOURCE_ACCOUNT_MISMATCH',
    'INTERNAL_USAGE_INSUFFICIENT_GL',
    'INVENTORY_GL_INSUFFICIENT',
    'OPERATIONAL_STOCK_COST_REQUIRED',
    'OPERATIONAL_ADJUSTMENT_MISSING_SOURCE_BASIS',
]);

// System-generated values only; user-entered names could trip the log monitor.
const LOGGED_DETAIL_KEYS = ['reason', 'accountCode'] as const;

export function traceableRejectionLine(
    code: string,
    details?: Record<string, unknown>,
): string | null {
    if (!TRACEABLE_REJECTION_CODES.has(code)) return null;
    const safe = Object.fromEntries(
        LOGGED_DETAIL_KEYS.filter(
            (key) => typeof details?.[key] === 'string',
        ).map((key) => [key, details![key]]),
    );
    return `[BusinessRejection] ${JSON.stringify({ code, ...safe })}`;
}
