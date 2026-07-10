/**
 * Melindo revenue rules — Phase 2.3a
 * Maps variant/product names to GL revenue accounts.
 * Priority: lower number = higher priority. First match wins.
 *
 * Only loaded when tenant subdomain = 'melindo'.
 * Kiyowo: empty rules → default sales-revenue role.
 */
export interface RevenueRule {
    matchType: 'VARIANT_NAME_CONTAINS' | 'PRODUCT_NAME';
    matchValue: string;
    accountCode: string;
    priority: number;
}

export const MELINDO_REVENUE_RULES: RevenueRule[] = [
    // === Rafia family (priority top-down) ===
    { matchType: 'VARIANT_NAME_CONTAINS', matchValue: 'Kw Super', accountCode: '4-116', priority: 10 },
    { matchType: 'VARIANT_NAME_CONTAINS', matchValue: 'Super', accountCode: '4-102', priority: 20 },
    { matchType: 'VARIANT_NAME_CONTAINS', matchValue: 'KW', accountCode: '4-104', priority: 30 },
    { matchType: 'VARIANT_NAME_CONTAINS', matchValue: 'Tampar', accountCode: '4-107', priority: 40 },

    // === Sedotan family ===
    { matchType: 'VARIANT_NAME_CONTAINS', matchValue: 'Steril', accountCode: '4-114', priority: 50 },
    { matchType: 'VARIANT_NAME_CONTAINS', matchValue: 'Tekuk', accountCode: '4-110', priority: 60 },
    { matchType: 'VARIANT_NAME_CONTAINS', matchValue: 'Pack', accountCode: '4-112', priority: 70 },

    // === Maklon (refine later: rafia vs sedotan maklon) ===
    { matchType: 'VARIANT_NAME_CONTAINS', matchValue: 'Maklon', accountCode: '4-108', priority: 80 },

    // === Product-level fallbacks ===
    { matchType: 'PRODUCT_NAME', matchValue: 'Lakop', accountCode: '4-111', priority: 90 },
    { matchType: 'PRODUCT_NAME', matchValue: 'Sedotan', accountCode: '4-105', priority: 100 },
    { matchType: 'PRODUCT_NAME', matchValue: 'Rafia', accountCode: '4-101', priority: 110 },

    // Unmatched → TenantAccountRole sales-revenue
    // Recommended ops: Melindo sales-revenue → 4-1000 for historical continuity
];
