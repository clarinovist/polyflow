/**
 * Company configuration for print templates.
 * Reads from env vars with generic fallback; tenant-specific overrides
 * from AppSetting are merged in company-settings.ts (server-only).
 *
 * No tenant-specific names, addresses, or bank accounts are hardcoded here.
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

export function parseBankAccounts(json: string | undefined): BankAccount[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Get logo URL — env-only fallback. Tenant-specific logos come from
 * AppSetting `company.logoUrl` via company-settings.ts.
 */
export function getLogoForSubdomain(_subdomain: string | null): string | null {
  return process.env.COMPANY_LOGO_URL || null;
}

/**
 * NOTE: this file is imported by some 'use client' print components (for the
 * sync getCompanyConfig() fallback + CompanyConfig type), so it must stay
 * free of any server-only imports — even behind a dynamic import.
 *
 * Per-tenant AppSetting overrides (set via /dashboard/settings → Perusahaan)
 * are applied in getCompanyConfigAsync() in ./company-settings.ts instead,
 * which is only ever imported by server components / route handlers.
 */
export async function getCompanyConfigAsync(): Promise<CompanyConfig> {
  return getCompanyConfig();
}

export function getCompanyConfig(): CompanyConfig {
  return {
    name: process.env.COMPANY_NAME || '',
    logoUrl: process.env.COMPANY_LOGO_URL || null,
    address: process.env.COMPANY_ADDRESS || '',
    phone: process.env.COMPANY_PHONE || '',
    email: process.env.COMPANY_EMAIL || '',
    bankAccountsNonPPN: parseBankAccounts(process.env.BANK_ACCOUNTS_NON_PPN) || [],
    bankAccountsPPN: parseBankAccounts(process.env.BANK_ACCOUNTS_PPN) || [],
    footerNote: process.env.COMPANY_FOOTER_NOTE || '',
    signerName: process.env.COMPANY_SIGNER_NAME || '',
    paperSize: {
      widthCm: parseFloat(process.env.COMPANY_PAPER_WIDTH_CM || '') || 24.13,
      heightCm: parseFloat(process.env.COMPANY_PAPER_HEIGHT_CM || '') || 13.97,
      marginMm: parseFloat(process.env.COMPANY_PAPER_MARGIN_MM || '') || 5,
    },
  };
}
