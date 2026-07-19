/**
 * Company configuration for print templates.
 * Reads from env vars with fallback to Melindo Jaya defaults.
 *
 * For multi-tenant: set these env vars per deployment.
 * Logo: provide a public URL or path (e.g. /logos/melindo.png).
 */

export interface BankAccount {
  holder: string;
  bank: string;
  account: string;
}

export interface PaperSize {
  /** Width in cm (e.g. 24.13 for 9.5 inches) */
  widthCm: number;
  /** Height in cm (e.g. 13.97 for 5.5 inches) */
  heightCm: number;
  /** Margin in mm */
  marginMm: number;
}

export interface CompanyConfig {
  name: string;
  logoUrl: string | null;
  address: string;
  phone: string;
  email: string;
  bankAccountsNonPPN: BankAccount[];
  bankAccountsPPN: BankAccount[];
  footerNote: string;
  signerName: string;
  paperSize: PaperSize;
}

function parseBankAccounts(json: string | undefined): BankAccount[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Logo URL mapping by subdomain.
 * Convention: /logos/{subdomain}.png
 */
const LOGO_MAP: Record<string, string> = {
  melindo: '/logos/melindo.png',
  kiyowo: '/logos/kiyowo.png',
};

/**
 * Get logo URL for a given subdomain.
 * Falls back to env var or null.
 */
export function getLogoForSubdomain(subdomain: string | null): string | null {
  if (subdomain && LOGO_MAP[subdomain]) {
    return LOGO_MAP[subdomain];
  }
  return process.env.COMPANY_LOGO_URL || null;
}

/**
 * Tenant-aware company config (async, uses headers()).
 * Call from Server Components to get correct logo per tenant.
 */
/**
 * NOTE: this file is imported by some 'use client' print components (for the
 * sync getCompanyConfig() fallback + CompanyConfig type), so it must stay
 * free of any server-only imports (Prisma, etc.) — even behind a dynamic
 * import — or Next's client bundler will fail trying to resolve them.
 *
 * Per-tenant AppSetting overrides (set via /dashboard/settings → Perusahaan)
 * are applied in getCompanyConfigAsync() in ./company-settings.ts instead,
 * which is only ever imported by server components / route handlers.
 */
export async function getCompanyConfigAsync(): Promise<CompanyConfig> {
  try {
    const { headers } = await import('next/headers');
    const hdrs = await headers();
    const host = hdrs.get('host') || '';
    const forwarded = hdrs.get('x-forwarded-host') || '';
    const hostname = host || forwarded;
    const subdomain = hostname.split('.')[0] || null;
    const base = getCompanyConfig();
    return { ...base, logoUrl: getLogoForSubdomain(subdomain) };
  } catch {
    return getCompanyConfig();
  }
}

export function getCompanyConfig(): CompanyConfig {
  return {
    name: process.env.COMPANY_NAME || 'CV MELINDO JAYA',
    logoUrl: process.env.COMPANY_LOGO_URL || null,
    address: process.env.COMPANY_ADDRESS || 'Puri Niaga RT.005 RW.006, Sawahan, Kel. Jaten,\nKec. Jaten, Karanganyar, Jawa Tengah 57731',
    phone: process.env.COMPANY_PHONE || '0271 82017580, 0271 6882007',
    email: process.env.COMPANY_EMAIL || 'jaya.melindo@gmail.com',
    bankAccountsNonPPN: parseBankAccounts(process.env.BANK_ACCOUNTS_NON_PPN) || [
      { holder: 'Nugroho Pramono', bank: 'Bank BCA', account: '7735006002' },
      { holder: 'Nugroho Pramono', bank: 'Bank BRI', account: '671401042839531' },
      { holder: 'Nugroho Pramono', bank: 'Bank Mandiri', account: '1380556667777' },
    ],
    bankAccountsPPN: parseBankAccounts(process.env.BANK_ACCOUNTS_PPN) || [
      { holder: 'MELINDO JAYA', bank: 'BANK BCA', account: '3270448789' },
      { holder: 'MELINDO JAYA', bank: 'BANK MANDIRI', account: '1380044458789' },
    ],
    footerNote: process.env.COMPANY_FOOTER_NOTE || 'BARANG YANG SUDAH DITERIMA TIDAK BISA DIKEMBALIKAN',
    signerName: process.env.COMPANY_SIGNER_NAME || 'Nugroho Pramono',
    paperSize: {
      widthCm: parseFloat(process.env.COMPANY_PAPER_WIDTH_CM || '') || 24.13,   // 9.5 inches
      heightCm: parseFloat(process.env.COMPANY_PAPER_HEIGHT_CM || '') || 13.97, // 5.5 inches
      marginMm: parseFloat(process.env.COMPANY_PAPER_MARGIN_MM || '') || 5,     // 5mm
    },
  };
}
