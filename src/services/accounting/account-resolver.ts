/**
 * Tenant-Aware Account Resolver
 *
 * Resolves GL accounts by role (semantic name) instead of hardcoded account codes.
 * Searches by exact code first (Kiyowo 5-digit format), then by name pattern
 * (Melindo "Piutang Dagang" format). Results are cached with TTL.
 */
import { ValidationError, NotFoundError } from "@/lib/errors/errors";

export type AccountRole =
  | "accounts-receivable"
  | "accounts-payable"
  | "petty-cash"
  | "bank-bca"
  | "bank-mandiri"
  | "vat-output"
  | "vat-input"
  | "income-tax"
  | "sales-revenue"
  | "sales-return"
  | "cogs"
  | "inventory"
  | "wip"
  | "finished-goods"
  | "packaging"
  | "scrap"
  | "raw-material"
  | "current-year-earnings"
  | "retained-earnings"
  | "adjustment-gain"
  | "adjustment-loss"
  | "manufacturing-overhead"
  | "accrued-liabilities"
  | "opening-balance-equity"
  | "shipping-expense"
  // New roles for transaction types (Phase 1)
  | "inventory-consumables"
  | "factory-electricity"
  | "factory-maintenance"
  | "factory-rent"
  | "office-salaries"
  | "misc-operating-expense"
  | "bank-loans"
  | "other-payables"
  | "fixed-asset-machinery"
  | "fixed-asset-vehicles"
  | "fixed-asset-buildings"
  | "fixed-asset-equipment"
  | "depreciation-expense"
  | "accumulated-depreciation"
  // Phase 2.1: Bank reconciliation roles
  | "bank-charges"
  | "interest-income"
  | "suspense-clearing"
  // Phase 3: Direct labor
  | "direct-labor";

interface AccountPattern {
  code?: string;
  nameContains?: string;
}

// Priority: first match wins.
// Pattern order: Kiyowo code → Melindo code → name spesifik → name generik.
const ACCOUNT_ROLE_PATTERNS: Record<AccountRole, AccountPattern[]> = {
  // === AR/AP ===
  "accounts-receivable": [
    { code: "11210" },
    { code: "1-115b" },
    { code: "1-115" },
    { nameContains: "Piutang Dagang" },
    { nameContains: "Accounts Receivable" },
  ],
  "accounts-payable": [
    { code: "21110" },
    { code: "2-110b" },
    { code: "2-110" },
    { nameContains: "Hutang Dagang" },
    { nameContains: "Trade Payable" },
  ],
  // === Cash / Bank ===
  "petty-cash": [
    { code: "1-112" },
    { code: "11110" },
    { nameContains: "Kas Kecil" },
    { nameContains: "Petty Cash" },
  ],
  "bank-bca": [
    { code: "11120" },
    { code: "1-114" },
    { nameContains: "Bank BCA" },
    { nameContains: "BCA" },
  ],
  "bank-mandiri": [
    { code: "11130" },
    { code: "1-113" },
    { nameContains: "Bank Mandiri" },
    { nameContains: "Mandiri" },
  ],
  // === Tax ===
  "vat-output": [
    { code: "21310" },
    { nameContains: "PPN Keluaran" },
    { nameContains: "VAT Output" },
  ],
  "vat-input": [
    { code: "21320" },
    { nameContains: "PPN Masukan" },
    { nameContains: "VAT Input" },
  ],
  "income-tax": [
    { code: "21330" },
    { nameContains: "PPh 21" },
    { nameContains: "Income Tax Payable" },
    { nameContains: "Hutang Pajak" },
  ],
  // === Revenue ===
  "sales-revenue": [
    { code: "41100" },
    { nameContains: "Penjualan" },
    { nameContains: "Sales Revenue" },
  ],
  "sales-return": [
    { code: "4-302" },
    { code: "41900" },
    { nameContains: "Retur Penjualan" },
    { nameContains: "Sales Return" },
  ],
  // === COGS ===
  cogs: [
    { code: "5-001" },
    { code: "5-011b" },
    { code: "51100" },
    { code: "50000" },
    { nameContains: "Harga Pokok" },
    { nameContains: "Cost of Goods Sold" },
    { nameContains: "COGS" },
  ],
  // === Inventory ===
  // Melindo operational codes first (1-xxx); Kiyowo 5-digit after (avoids ghost hits on hybrid COA).
  inventory: [
    { code: "1-130" },
    { code: "11300" },
    { nameContains: "Persediaan Bahan Baku" },
    { nameContains: "Persediaan" },
    { nameContains: "Inventory" },
  ],
  wip: [
    { code: "1-132" },
    { code: "11320" },
    { nameContains: "Work in Progress" },
    { nameContains: "Dalam Proses" },
  ],
  "finished-goods": [
    { code: "1-128" },
    { code: "11330" },
    { nameContains: "Barang Jadi" },
    { nameContains: "Finished Goods" },
  ],
  packaging: [
    { code: "1-131" },
    { code: "11340" },
    { nameContains: "Packing" },
    { nameContains: "Packaging" },
    { nameContains: "Bahan Kemasan" },
  ],
  scrap: [
    { code: "1-127" },
    { code: "11350" },
    { nameContains: "Scrap" },
    { nameContains: "Afval" },
    { nameContains: "Affal" },
  ],
  "raw-material": [
    { code: "1-130" },
    { code: "11310" },
    { nameContains: "Bahan Baku" },
    { nameContains: "Raw Material" },
  ],
  // === Equity ===
  "current-year-earnings": [
    { code: "33000" },
    { code: "3-201b" },
    { code: "3-201" },
    { nameContains: "Laba Tahun Berjalan" },
    { nameContains: "Laba Berjalan" },
    { nameContains: "Current Year Earnings" },
  ],
  "retained-earnings": [
    { code: "32000" },
    { nameContains: "Laba Ditahan" },
    { nameContains: "Retained Earnings" },
  ],
  // === Adjustment === — Melindo-first
  "adjustment-gain": [
    { code: "7-101" },
    { code: "7-1000" },
    { code: "81100" },
    { nameContains: "Selisih Lebih" },
    { nameContains: "Pendapatan Lain-lain" },
    { nameContains: "Adjustment Gain" },
  ],
  "adjustment-loss": [
    { code: "8-202" },
    { code: "8-1000" },
    { code: "91100" },
    { nameContains: "Selisih Kurang" },
    { nameContains: "Biaya Lain-lain" },
    { nameContains: "Adjustment Loss" },
  ],
  // === Overhead / Accrual ===
  "manufacturing-overhead": [
    { code: "5-023" },
    { code: "53000" },
    { nameContains: "Manufacturing Overhead" },
    { nameContains: "Overhead Pabrik" },
    { nameContains: "Overhead" },
  ],
  "accrued-liabilities": [
    { code: "21200" },
    { nameContains: "Beban Akrual" },
    { nameContains: "Accrued" },
  ],
  "opening-balance-equity": [
    { code: "3-200b" },
    { code: "32000" },
    { code: "30000" },
    { nameContains: "Laba Ditahan" },
    { nameContains: "Saldo Awal" },
    { nameContains: "Opening Balance" },
  ],
  // === Shipping ===
  "shipping-expense": [
    { code: "61100" },
    { nameContains: "Shipping & Delivery" },
    { nameContains: "Biaya Pengiriman" },
    { nameContains: "Ongkos Kirim" },
  ],
  // === NEW: Transaction type roles (Phase 1) === — Melindo-first
  "inventory-consumables": [
    { code: "1-134" },
    { code: "11360" },
    { nameContains: "Inventory - Consumables" },
    { nameContains: "Consumable" },
    { nameContains: "Persediaan Alat Tulis" },
  ],
  "factory-electricity": [
    { code: "5-031" },
    { code: "53200" },
    { nameContains: "Factory Electricity" },
    { nameContains: "Pemakaian Listrik" },
    { nameContains: "Listrik Produksi" },
  ],
  "factory-maintenance": [
    { code: "5-033" },
    { code: "53300" },
    { nameContains: "Factory Maintenance" },
    { nameContains: "Maintenance Mesin Produksi" },
    { nameContains: "Maintenance Mesin" },
  ],
  "factory-rent": [
    { code: "53410" },
    { code: "5-023" },
    { nameContains: "Factory Rent" },
    { nameContains: "Overhead Sewa Gudang" },
    { nameContains: "Sewa Gudang" },
  ],
  "office-salaries": [
    { code: "62100" },
    { nameContains: "Office Salaries" },
    { nameContains: "Gaji Rafia" },
    { nameContains: "Beban Gaji" },
    { nameContains: "Gaji" }, // last resort
  ],
  "misc-operating-expense": [
    { code: "62400" },
    { nameContains: "Professional Fees" },
    { nameContains: "Biaya Usaha Lainnya" },
    { nameContains: "Operating Expense" },
  ],
  "bank-loans": [
    { code: "22100" },
    { code: "2-210" },
    { nameContains: "Bank Loans" },
    { nameContains: "Hutang Jangka Panjang" },
    { nameContains: "Pinjaman Bank" },
  ],
  "other-payables": [
    { code: "21120" },
    { code: "2-390" },
    { nameContains: "Other Payables" },
    { nameContains: "Hutang Owner" },
    { nameContains: "Hutang Pemilik" },
    { nameContains: "Hutang ke Pemilik" },
  ],
  "fixed-asset-machinery": [
    { code: "12100" },
    { code: "1-213b" },
    { code: "1-213" },
    { nameContains: "Machinery & Equipment" },
    { nameContains: "Mesin Rafia" },
    { nameContains: "Mesin" },
  ],
  "fixed-asset-vehicles": [
    { code: "12300" },
    { code: "1-214" },
    { nameContains: "Vehicles" },
    { nameContains: "Kendaraan" },
  ],
  "fixed-asset-buildings": [
    { code: "12200" },
    { code: "1-212" },
    { nameContains: "Buildings" },
    { nameContains: "Bangunan" },
  ],
  "fixed-asset-equipment": [
    { code: "12150" },
    { code: "1-213a" },
    { nameContains: "Office Equipment" },
    { nameContains: "Peralatan Kantor" },
    { nameContains: "Peralatan" },
  ],
  "depreciation-expense": [
    { code: "61100" },
    { code: "6-001" },
    { nameContains: "Depreciation Expense" },
    { nameContains: "Beban Depresiasi" },
    { nameContains: "Penyusutan" },
  ],
  "accumulated-depreciation": [
    { code: "12900" },
    { code: "1-219" },
    { nameContains: "Accumulated Depreciation" },
    { nameContains: "Akumulasi Penyusutan" },
  ],
  // === Phase 2.1: Bank reconciliation ===
  "bank-charges": [
    { code: "91200" },
    { code: "8-200" },
    { nameContains: "Bank Charges" },
    { nameContains: "Biaya Admin Bank" },
    { nameContains: "Biaya Bank" },
    { nameContains: "Administrasi Bank" },
  ],
  "interest-income": [
    { code: "81200" },
    { code: "7-100" },
    { nameContains: "Interest Income" },
    { nameContains: "Pendapatan Bunga Bank" },
    { nameContains: "Pendapatan Bunga" },
    { nameContains: "Bunga Bank" },
  ],
  "suspense-clearing": [
    { code: "1-199" },
    { nameContains: "Rekening Sementara" },
    { nameContains: "Suspense" },
    { nameContains: "Clearing" },
  ],
  // === Phase 3: Direct labor ===
  "direct-labor": [
    { code: "5-012b" },
    { code: "5-012" },
    { code: "51200" },
    { nameContains: "Tenaga Kerja Langsung" },
    { nameContains: "Direct Labor" },
    { nameContains: "Upah Tenaga Kerja" },
  ],
};

export type ResolvedAccount = { id: string; code: string; name: string };

/** Return all defined AccountRole values. */
export function getAllAccountRoles(): AccountRole[] {
  return Object.keys(ACCOUNT_ROLE_PATTERNS) as AccountRole[];
}

/**
 * Resolve account by Phase 1 patterns (code → Melindo code → name).
 * Extracted so seed + tests can call directly without DB mapping dependency.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PatternDb = { account: { findUnique: (args: any) => Promise<any>; findFirst: (args: any) => Promise<any> } };

const GHOST_CODES_SET = new Set([
  '11110', '11300', '11310', '11340', '11350', '21200', '30000', '51100', '80000', '81000', '81100', '90000', '91000', '91100',
  // extended blocklist also blocks kiyowo pure codes when reused on melindo
  '11000','11100','11210','11290','11400','11410','12000','12100','12110','12120','12190','12200','12290','12300','12390',
  '21000','21100','21110','21120','21300','21310','21320','21330','21400','22000','22100',
  '31000','32000','33000','41000','41100','41200','41900','50000','51000','51200','52000','52100','52200','53000','53100','53200','53300','53400','53410',
  '60000','61000','61100','61200','62000','62100','62200','62300','62400',
]);

async function isMelindoTenantDb(db: PatternDb): Promise<boolean> {
  // Melindo marker: has 1-130 and 1-127 and 7-101 (melindo chart). Kiyowo has 11300 active but no 1-130.
  const marker = await db.account.findUnique({ where: { code: '1-130' } });
  return !!marker;
}

export async function resolveByPatterns(
  role: AccountRole,
  db?: PatternDb,
): Promise<ResolvedAccount> {
  const { prisma: proxyPrisma } = await import("@/lib/core/prisma");
  const target = db ?? proxyPrisma;

  const patterns = ACCOUNT_ROLE_PATTERNS[role];
  if (!patterns) throw new ValidationError(`Peran akun tidak dikenal: ${role}`, { role });

  const tenantIsMelindo = await isMelindoTenantDb(target);

  for (const pattern of patterns) {
    let account = null;
    if (pattern.code) {
      // Tenant-aware ghost skip: if melindo tenant + code is ghost blocklist, skip fetching unless it's a melindo code
      if (tenantIsMelindo && GHOST_CODES_SET.has(pattern.code) && !pattern.code.startsWith('1-') && !pattern.code.startsWith('7-') && !pattern.code.startsWith('8-') && !pattern.code.startsWith('3-200')) {
        // Still allow if it's the ONLY possible code for this role (kiyowo tenant will fallback), but for melindo skip
        // Check if melindo has active marker: if yes, skip ghost codes entirely
        // ponytail: this is intentional melindo-only guard. Kiyowo tenant bypasses because isMelindo=false branch not taken? Actually we ARE in this if.
        // For melindo, we want to skip ghost. For kiyowo, isMelindo=false so this block not triggered.
        continue; // skip ghost code on melindo
      }
      account = await target.account.findUnique({ where: { code: pattern.code } });
    } else if (pattern.nameContains) {
      account = await target.account.findFirst({
        where: {
          name: { contains: pattern.nameContains, mode: "insensitive" },
          isActive: true,
        },
        orderBy: { code: 'asc' },
      });
      if (!account) {
        account = await target.account.findFirst({
          where: { name: { contains: pattern.nameContains, mode: "insensitive" } },
        });
      }
    }
    if (account) {
      if (account.isActive === false) continue;
      // For melindo, never return ghost even if matched via nameContains
      if (tenantIsMelindo && GHOST_CODES_SET.has(account.code)) {
        // If name match yields ghost, continue searching for melindo alternative
        continue;
      }
      return { id: account.id, code: account.code, name: account.name };
    }
  }

  throw new NotFoundError(`Account for role '${role}'`, role);
}

// ---------------------------------------------------------------------------
// Tenant-scoped cache (unchanged keying: PrismaClient instance + role)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  value: ResolvedAccount;
  timestamp: number;
}

const tenantCache = new Map<object, Map<string, CacheEntry>>();

/**
 * Resolve an account by role.
 *
 * Resolution order:
 *   1. Tenant-scoped cache (5 min TTL)
 *   2. DB mapping: TenantAccountRole in MAIN DB → Account in tenant DB
 *   3. Phase 1 patterns (code → Melindo code → name)
 *   4. Throw with actionable message
 */
export async function resolveAccount(
  role: AccountRole,
  explicitTenantId?: string,
): Promise<ResolvedAccount> {
  const { tenantContext, getTenantIdFromContext, getMainPrisma } = await import("@/lib/core/prisma");
  const tenantDb = tenantContext.getStore();
  const tenantId = explicitTenantId ?? getTenantIdFromContext();
  const cacheTarget = tenantDb ?? getMainPrisma();

  // --- Cache check ---
  let roleMap = tenantCache.get(cacheTarget);
  if (!roleMap) {
    roleMap = new Map();
    tenantCache.set(cacheTarget, roleMap);
  }
  const cached = roleMap.get(role);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  // --- Step 1: DB mapping (Phase 2) ---
  if (tenantId) {
    try {
      const mainPrisma = getMainPrisma();
      const mapping = await mainPrisma.tenantAccountRole.findUnique({
        where: { tenantId_role: { tenantId, role } },
      });
      if (mapping) {
        // Look up the actual Account in the tenant DB
        const account = tenantDb
          ? await tenantDb.account.findUnique({ where: { id: mapping.accountId } })
          : null;
        if (account && account.isActive !== false) {
          const result: ResolvedAccount = { id: account.id, code: account.code, name: account.name };
          roleMap.set(role, { value: result, timestamp: Date.now() });
          return result;
        }
        // Orphan mapping — account deleted or inactive; fall through to patterns
        if (mapping && !account) {
          const { logger } = await import("@/lib/config/logger");
          logger.warn("TenantAccountRole orphan mapping; falling back to patterns", {
            module: "account-resolver",
            role,
            tenantId,
            accountId: mapping.accountId,
          });
        }
      }
    } catch (err) {
      // DB lookup failed — fall through to patterns (graceful degradation)
      const { logger } = await import("@/lib/config/logger");
      logger.warn("TenantAccountRole DB lookup failed; falling back to patterns", {
        module: "account-resolver",
        role,
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // --- Step 2: Pattern fallback (Phase 1) ---
  // Don't pass tenantDb — let resolveByPatterns use the proxy (routes via tenantContext)
  try {
    const result = await resolveByPatterns(role);
    roleMap.set(role, { value: result, timestamp: Date.now() });
    return result;
  } catch {
    throw new NotFoundError(
      `Account for role '${role}'`,
      role,
    );
  }
}

export function clearAccountCache(): void {
  for (const roleMap of tenantCache.values()) {
    roleMap.clear();
  }
}
