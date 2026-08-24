const DOMAIN_MAP: Record<string, string> = {
  '/warehouse/inventory': 'stock',
  '/sales/orders': 'sales',
  '/sales/deliveries': 'sales',
  '/production/orders': 'production',
  '/finance/invoices/sales': 'finance',
  '/finance/aging': 'finance',
  '/purchasing/orders': 'purchasing',
  // '/hrd/attendance': 'hrd' dihapus 2026-08-24 — 'hrd' tidak pernah ada di
  // ALL_DOMAINS maupun VALID_DATA_DOMAINS, jadi mapping ini tidak berefek
  // apa pun. Kalau domain HRD dibutuhkan, daftarkan dulu di kedua list itu.
};

// 'price' sengaja TIDAK ada di DOMAIN_MAP maupun di cabang prefix di bawah:
// harga hanya untuk ADMIN/superadmin, yang masuk lewat cabang `hasAll`.
// Menambahkan '/sales/price-list' -> 'price' di sini akan memberi akses ke
// SALES/MARKETING. Lihat docs/plan/2026-08-24-telegram-miniapp-harga-dan-audit.md §0.
const ALL_DOMAINS = [
  'stock',
  'sales',
  'production',
  'finance',
  'purchasing',
  'price',
] as const;

type ComputeAllowedDomainsInput = {
  isSuperAdmin: boolean;
  role: string;
  assignedRoles: string[];
  allowedResources: string[] | 'ALL';
};

export function computeAllowedDomains(input: ComputeAllowedDomainsInput): Set<string> {
  const { isSuperAdmin, role, assignedRoles, allowedResources } = input;
  const allowedDomainsSet = new Set<string>();
  const hasAll = isSuperAdmin || assignedRoles.includes('ADMIN') || role === 'ADMIN';

  if (hasAll) {
    ALL_DOMAINS.forEach((d) => allowedDomainsSet.add(d));
  } else if (allowedResources === 'ALL') {
    ALL_DOMAINS.forEach((d) => allowedDomainsSet.add(d));
  } else {
    for (const res of allowedResources) {
      const dom = DOMAIN_MAP[res];
      if (dom) allowedDomainsSet.add(dom);
      if (res === '/warehouse') allowedDomainsSet.add('stock');
      if (res === '/sales') allowedDomainsSet.add('sales');
      if (res === '/production') allowedDomainsSet.add('production');
      if (res === '/finance') allowedDomainsSet.add('finance');
      if (res === '/purchasing') allowedDomainsSet.add('purchasing');
    }
  }

  return allowedDomainsSet;
}

export const VALID_DATA_DOMAINS = [
  'stock',
  'sales',
  'production',
  'finance',
  'purchasing',
  'price',
] as const;

export type DataDomain = (typeof VALID_DATA_DOMAINS)[number];

export function isValidDataDomain(domain: string): domain is DataDomain {
  return (VALID_DATA_DOMAINS as readonly string[]).includes(domain);
}
