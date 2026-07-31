const DOMAIN_MAP: Record<string, string> = {
  '/warehouse/inventory': 'stock',
  '/sales/orders': 'sales',
  '/sales/deliveries': 'sales',
  '/production/orders': 'production',
  '/finance/invoices/sales': 'finance',
  '/finance/aging': 'finance',
  '/purchasing/orders': 'purchasing',
  '/hrd/attendance': 'hrd',
};

const ALL_DOMAINS = ['stock', 'sales', 'production', 'finance', 'purchasing'] as const;

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

export const VALID_DATA_DOMAINS = ['stock', 'sales', 'production', 'finance', 'purchasing'] as const;

export type DataDomain = (typeof VALID_DATA_DOMAINS)[number];

export function isValidDataDomain(domain: string): domain is DataDomain {
  return (VALID_DATA_DOMAINS as readonly string[]).includes(domain);
}
