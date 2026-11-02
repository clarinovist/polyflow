/**
 * Apply-time rejection codes that are raised before the correction commits.
 * Clearing the pending key for these is safe: the operator can start a new
 * preview instead of staying locked as "status unknown". Keep this list in one
 * place so the apply form and the restored-request panel cannot drift.
 */
const ATK_NOT_APPLIED_CODES = new Set([
    'ATK_RECOVERY_BLOCKED',
    'PURCHASE_PRICE_CORRECTED',
    'ATK_BACKUP_FAILED',
    'VALIDATION_ERROR',
    'AUTHORIZATION_ERROR',
    'BUSINESS_RULE_VIOLATION',
    'FISCAL_PERIOD_CLOSED',
]);

export function isAtkNotAppliedFailure(
    code: string | null | undefined,
): boolean {
    return !!code && ATK_NOT_APPLIED_CODES.has(code);
}
