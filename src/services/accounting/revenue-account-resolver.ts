/**
 * Revenue Account Resolver — Phase 2.3
 *
 * Resolution order for sales invoice revenue accounts:
 *   1. ProductVariant.revenueAccountId (per-variant override)
 *   2. Product.revenueAccountId (per-product override)
 *   3. Tenant revenue rules (name → account code) — Melindo only when rules passed
 *   4. null → caller uses resolveAccount('sales-revenue')
 */
import type { PrismaClient } from '@prisma/client';
import type { RevenueRule } from './melindo-revenue-rules';

export type RevenueLine = {
    accountId: string;
    accountCode: string;
    accountName: string;
    source: 'variant' | 'product' | 'rule' | 'default-role';
};

export type InvoiceItemForRevenue = {
    quantity: number;
    unitPrice: number;
    variant?: {
        id?: string;
        name: string;
        skuCode?: string;
        revenueAccountId?: string | null;
        product?: {
            id?: string;
            name: string;
            revenueAccountId?: string | null;
        } | null;
    } | null;
};

/** Cache: cacheKey → accountCode → accountId */
const codeIdCaches = new Map<string, Map<string, string>>();

/**
 * Resolve revenue account for a single invoice line.
 * Returns null when caller should use TenantAccountRole `sales-revenue`.
 */
export async function resolveRevenueAccount(
    item: InvoiceItemForRevenue,
    tenantDb: Pick<PrismaClient, 'account'>,
    rules: RevenueRule[],
    cacheKey: string,
): Promise<RevenueLine | null> {
    // 1. Variant override
    if (item.variant?.revenueAccountId) {
        const account = await tenantDb.account.findUnique({
            where: { id: item.variant.revenueAccountId },
        });
        if (account && account.isActive !== false) {
            return {
                accountId: account.id,
                accountCode: account.code,
                accountName: account.name,
                source: 'variant',
            };
        }
    }

    // 2. Product override
    if (item.variant?.product?.revenueAccountId) {
        const account = await tenantDb.account.findUnique({
            where: { id: item.variant.product.revenueAccountId },
        });
        if (account && account.isActive !== false) {
            return {
                accountId: account.id,
                accountCode: account.code,
                accountName: account.name,
                source: 'product',
            };
        }
    }

    // 3. Rules (only if caller passed rules — Melindo gated outside)
    if (rules.length > 0 && item.variant) {
        const ruleMatch = await matchRule(item.variant, rules, cacheKey, tenantDb);
        if (ruleMatch) return ruleMatch;
    }

    // 4. Caller fallback
    return null;
}

async function matchRule(
    variant: {
        name: string;
        skuCode?: string;
        product?: { name: string } | null;
    },
    rules: RevenueRule[],
    cacheKey: string,
    tenantDb: Pick<PrismaClient, 'account'>,
): Promise<RevenueLine | null> {
    const sorted = [...rules].sort((a, b) => a.priority - b.priority);

    for (const rule of sorted) {
        let matches = false;
        if (rule.matchType === 'VARIANT_NAME_CONTAINS') {
            matches = variant.name.toLowerCase().includes(rule.matchValue.toLowerCase());
        } else if (rule.matchType === 'PRODUCT_NAME') {
            // Product-level: case-insensitive equality (not loose includes on variant name)
            matches =
                variant.product?.name?.toLowerCase() === rule.matchValue.toLowerCase();
        }

        if (!matches) continue;

        const accountId = await resolveAccountCodeAsync(rule.accountCode, cacheKey, tenantDb);
        if (!accountId) continue;

        const account = await tenantDb.account.findUnique({ where: { id: accountId } });
        if (!account || account.isActive === false) continue;

        return {
            accountId: account.id,
            accountCode: account.code,
            accountName: account.name,
            source: 'rule',
        };
    }

    return null;
}

export async function resolveAccountCodeAsync(
    code: string,
    cacheKey: string,
    tenantDb: Pick<PrismaClient, 'account'>,
): Promise<string | null> {
    let cache = codeIdCaches.get(cacheKey);
    if (!cache) {
        cache = new Map();
        codeIdCaches.set(cacheKey, cache);
    }
    if (cache.has(code)) return cache.get(code)!;

    const account = await tenantDb.account.findUnique({ where: { code } });
    if (account && account.isActive !== false) {
        cache.set(code, account.id);
        return account.id;
    }
    return null;
}

export function clearRevenueRuleCache(): void {
    codeIdCaches.clear();
}
