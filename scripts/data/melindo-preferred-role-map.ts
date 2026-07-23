/**
 * Melindo preferred role → account mapping.
 * Source of truth for apply-tenant-account-role-fixes.ts.
 * Verified against live melindo_rafia COA 2026-07-09.
 *
 * Format: { role, code, name, severity }
 * severity: 'high' | 'medium' | 'low'
 */
export interface PreferredMapping {
    role: string;
    code: string;
    name: string;
    severity: 'high' | 'medium' | 'low';
}

export const MELINDO_PREFERRED_MAP: PreferredMapping[] = [
    // === High severity (operational impact) ===
    { role: 'petty-cash',           code: '1-112',  name: 'Kas Kecil',                           severity: 'high' },
    { role: 'raw-material',         code: '1-130',  name: 'Persediaan Bahan Baku Rafia',         severity: 'high' },
    { role: 'packaging',            code: '1-131',  name: 'Persediaan Bahan Kemasan Rafia',      severity: 'high' },
    { role: 'cogs',                 code: '5-001',  name: 'Harga Pokok Penjualan',               severity: 'high' },
    { role: 'sales-return',         code: '4-302',  name: 'Retur Penjualan',                     severity: 'high' },
    { role: 'bank-charges',         code: '8-200',  name: 'Biaya Admin Bank',                    severity: 'high' },
    { role: 'interest-income',      code: '7-100',  name: 'Pendapatan Bunga Bank',               severity: 'high' },
    { role: 'adjustment-gain',      code: '7-101',  name: 'Pendapatan Lain-lain Diluar Usaha',   severity: 'high' },
    { role: 'adjustment-loss',      code: '8-202',  name: 'Biaya Lain-lain Diluar Usaha',        severity: 'high' },
    { role: 'opening-balance-equity', code: '3-200b', name: 'Laba Ditahan Rafia',                severity: 'high' },
    { role: 'scrap',                code: '1-127',  name: 'Persediaan Bahan Penolong',           severity: 'high' },

    // === Medium severity ===
    { role: 'suspense-clearing',    code: '1-199',  name: 'Rekening Sementara',                  severity: 'medium' },
    { role: 'manufacturing-overhead', code: '5-023', name: 'Overhead Sewa Gudang',                severity: 'medium' },
    { role: 'inventory',            code: '1-130',  name: 'Persediaan Bahan Baku Rafia',         severity: 'medium' },
    { role: 'accrued-liabilities',  code: '2-112',  name: 'Hutang Biaya',                        severity: 'medium' },
    { role: 'inventory-consumables', code: '1-134', name: 'Persediaan Alat Tulis',               severity: 'medium' },
    { role: 'finished-goods',       code: '1-128',  name: 'Persediaan Barang Jadi Rafia',        severity: 'medium' },
    { role: 'wip',                  code: '1-132',  name: 'Persediaan Barang dalam Proses Rafia', severity: 'medium' },

    // === Low severity (C1 placeholder — ops may change via UI) ===
    // Live Melindo: 4-101 = Penjualan Rafia Bal (one product line; multi-line sales is Phase 2.3)
    { role: 'sales-revenue',        code: '4-1000',  name: 'PENDAPATAN USAHA',                   severity: 'low' },
];

/**
 * Roles that should NOT be touched by apply script (already correct).
 * Verified: accounts-receivable=1-115b, accounts-payable=2-110b, bank-bca=1-114,
 * bank-mandiri=1-113, factory-electricity=5-031, factory-maintenance=5-033,
 * current-year-earnings=3-201b, finished-goods=1-128.
 */
export const MELINDO_EXCLUDED_ROLES = new Set([
    'accounts-receivable',
    'accounts-payable',
    'bank-bca',
    'bank-mandiri',
    'factory-electricity',
    'factory-maintenance',
    'factory-rent',
    'current-year-earnings',
    'finished-goods',
    'office-salaries',
    'shipping-expense',
    'other-payables',
    'income-tax',
    'vat-output',
    'vat-input',
    'retained-earnings',
]);
