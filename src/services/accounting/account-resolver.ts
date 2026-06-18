/**
 * Tenant-Aware Account Resolver
 *
 * Resolves GL accounts by role (semantic name) instead of hardcoded account codes.
 * Searches by exact code first (Kiyowo 5-digit format), then by name pattern
 * (Melindo "Piutang Dagang" format). Results are cached with TTL.
 */

import { prisma } from '@/lib/core/prisma';

export type AccountRole =
    | 'accounts-receivable'
    | 'accounts-payable'
    | 'petty-cash'
    | 'bank-bca'
    | 'vat-output'
    | 'vat-input'
    | 'income-tax'
    | 'sales-revenue'
    | 'sales-return'
    | 'cogs'
    | 'inventory'
    | 'wip'
    | 'finished-goods'
    | 'packaging'
    | 'scrap'
    | 'raw-material'
    | 'current-year-earnings'
    | 'retained-earnings'
    | 'adjustment-gain'
    | 'adjustment-loss'
    | 'manufacturing-overhead'
    | 'accrued-liabilities'
    | 'opening-balance-equity';

interface AccountPattern {
    code?: string;
    nameContains?: string;
}

// Priority: first match wins. Include both Kiyowo (5-digit) and name-based patterns.
const ACCOUNT_ROLE_PATTERNS: Record<AccountRole, AccountPattern[]> = {
    'accounts-receivable': [
        { code: '11210' },
        { nameContains: 'Piutang Dagang' },
        { nameContains: 'Accounts Receivable' },
    ],
    'accounts-payable': [
        { code: '21110' },
        { nameContains: 'Hutang Dagang' },
        { nameContains: 'Trade Payable' },
    ],
    'petty-cash': [
        { code: '11110' },
        { nameContains: 'Kas Kecil' },
        { nameContains: 'Petty Cash' },
    ],
    'bank-bca': [
        { code: '11120' },
        { nameContains: 'Bank BCA' },
        { nameContains: 'Bank Mandiri' },
    ],
    'vat-output': [
        { code: '21310' },
        { nameContains: 'PPN Keluaran' },
        { nameContains: 'VAT Output' },
    ],
    'vat-input': [
        { code: '21320' },
        { nameContains: 'PPN Masukan' },
        { nameContains: 'VAT Input' },
    ],
    'income-tax': [
        { code: '21330' },
        { nameContains: 'PPh 21' },
        { nameContains: 'Income Tax Payable' },
    ],
    'sales-revenue': [
        { code: '41100' },
        { nameContains: 'Penjualan' },
        { nameContains: 'Sales Revenue' },
    ],
    'sales-return': [
        { code: '41900' },
        { nameContains: 'Retur Penjualan' },
        { nameContains: 'Sales Return' },
    ],
    'cogs': [
        { code: '51100' },
        { code: '50000' },
        { nameContains: 'Harga Pokok' },
        { nameContains: 'Cost of Goods Sold' },
        { nameContains: 'COGS' },
    ],
    'inventory': [
        { code: '11300' },
        { nameContains: 'Persediaan' },
        { nameContains: 'Inventory' },
    ],
    'wip': [
        { code: '11320' },
        { nameContains: 'Work in Progress' },
        { nameContains: 'Dalam Proses' },
    ],
    'finished-goods': [
        { code: '11330' },
        { nameContains: 'Barang Jadi' },
        { nameContains: 'Finished Goods' },
    ],
    'packaging': [
        { code: '11340' },
        { nameContains: 'Packing' },
        { nameContains: 'Packaging' },
    ],
    'scrap': [
        { code: '11350' },
        { nameContains: 'Scrap' },
        { nameContains: 'Afval' },
    ],
    'raw-material': [
        { code: '11310' },
        { nameContains: 'Bahan Baku' },
        { nameContains: 'Raw Material' },
    ],
    'current-year-earnings': [
        { code: '33000' },
        { nameContains: 'Laba Tahun Berjalan' },
        { nameContains: 'Current Year Earnings' },
    ],
    'retained-earnings': [
        { code: '32000' },
        { nameContains: 'Laba Ditahan' },
        { nameContains: 'Retained Earnings' },
    ],
    'adjustment-gain': [
        { code: '81100' },
        { nameContains: 'Selisih Lebih' },
        { nameContains: 'Adjustment Gain' },
    ],
    'adjustment-loss': [
        { code: '91100' },
        { nameContains: 'Selisih Kurang' },
        { nameContains: 'Adjustment Loss' },
    ],
    'manufacturing-overhead': [
        { code: '51100' },
        { nameContains: 'Manufacturing Overhead' },
        { nameContains: 'Overhead Pabrik' },
    ],
    'accrued-liabilities': [
        { code: '21200' },
        { nameContains: 'Beban Akrual' },
        { nameContains: 'Accrued' },
    ],
    'opening-balance-equity': [
        { code: '30000' },
        { nameContains: 'Saldo Awal' },
        { nameContains: 'Opening Balance' },
    ],
};

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
    value: { id: string; code: string; name: string };
    timestamp: number;
}

const cache = new Map<string, CacheEntry>();

export type ResolvedAccount = { id: string; code: string; name: string };

/**
 * Resolve an account by role. Tries exact code match first, then name pattern.
 * Cache is tenant-scoped via tenantId prefix to prevent cross-tenant leakage.
 */
export async function resolveAccount(
    role: AccountRole,
    tenantId?: string
): Promise<ResolvedAccount> {
    const cacheKey = tenantId ? `${tenantId}:${role}` : role;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.value;
    }

    const patterns = ACCOUNT_ROLE_PATTERNS[role];
    if (!patterns) throw new Error(`Unknown account role: ${role}`);

    for (const pattern of patterns) {
        let account = null;
        if (pattern.code) {
            account = await prisma.account.findUnique({ where: { code: pattern.code } });
        } else if (pattern.nameContains) {
            account = await prisma.account.findFirst({
                where: { name: { contains: pattern.nameContains, mode: 'insensitive' } }
            });
        }
        if (account) {
            const result: ResolvedAccount = { id: account.id, code: account.code, name: account.name };
            cache.set(cacheKey, { value: result, timestamp: Date.now() });
            return result;
        }
    }

    const searchedCodes = patterns.filter(p => p.code).map(p => p.code).join(', ');
    const searchedNames = patterns.filter(p => p.nameContains).map(p => p.nameContains).join(', ');
    throw new Error(
        `Account not found for role "${role}". Searched codes: ${searchedCodes}. Searched names: ${searchedNames}.`
    );
}

export function clearAccountCache(): void {
    cache.clear();
}
