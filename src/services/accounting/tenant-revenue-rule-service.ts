/**
 * Tenant Revenue Rule Loader
 *
 * Single typed loader for runtime revenue-rule consumption. Rules live in the
 * MAIN database (TenantRevenueRule) so they are tenant-owned and editable via
 * the Revenue Rules UI. Loaded by tenant ID, never by subdomain.
 */
import { getMainPrisma } from '@/lib/core/prisma';

export type RevenueMatchType =
    | 'VARIANT_NAME_CONTAINS'
    | 'PRODUCT_NAME'
    | 'SKU_PREFIX';

export interface RevenueRule {
    matchType: RevenueMatchType;
    matchValue: string;
    accountCode: string;
    priority: number;
}

/**
 * Deterministic match-type parser. Unknown types are ignored instead of
 * guessing, so a typo in data can never silently change journal mapping.
 */
export function parseRevenueMatchType(value: string): RevenueMatchType | null {
    if (
        value === 'VARIANT_NAME_CONTAINS' ||
        value === 'PRODUCT_NAME' ||
        value === 'SKU_PREFIX'
    ) {
        return value;
    }
    return null;
}

/**
 * Load active revenue rules for a tenant from the main DB, in priority order.
 *
 * Fail-safe: any DB failure logs a warning and returns an empty rule list so
 * callers fall back to the default semantic role (`sales-revenue`) instead of
 * an incorrect guessed account.
 */
export async function loadActiveTenantRevenueRules(
    tenantId?: string,
): Promise<RevenueRule[]> {
    if (!tenantId) return [];

    try {
        const rows = await getMainPrisma().tenantRevenueRule.findMany({
            where: { tenantId, isActive: true },
            orderBy: { priority: 'asc' },
        });

        const rules: RevenueRule[] = [];
        for (const row of rows) {
            const matchType = parseRevenueMatchType(row.matchType);
            const accountCode = row.accountCode?.trim();
            if (!matchType || !accountCode) continue;
            rules.push({
                matchType,
                matchValue: row.matchValue,
                accountCode,
                priority: row.priority,
            });
        }
        return rules;
    } catch (err) {
        const { logger } = await import('@/lib/config/logger');
        logger.warn('Failed to load tenant revenue rules; using defaults', {
            module: 'tenant-revenue-rule-service',
            tenantId,
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}
