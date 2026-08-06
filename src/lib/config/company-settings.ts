/**
 * Per-tenant company setting overrides stored in the AppSetting key-value table.
 *
 * These override the env-based defaults in company.ts. The mapping below is the
 * single source of truth for AppSetting keys used by both the settings actions
 * (write) and getCompanyConfigWithOverridesAsync (read).
 *
 * SERVER-ONLY: this module imports Prisma dynamically. Never import it from a
 * 'use client' component — use company.ts's sync getCompanyConfig() there instead.
 */

export interface CompanySettings {
    name: string;
    address: string;
    phone: string;
    whatsapp: string;
    email: string;
    footerNote: string;
    signerName: string;
    logoUrl: string;
    bankAccountsNonPPN: string; // JSON: BankAccount[]
    bankAccountsPPN: string; // JSON: BankAccount[]
    paperWidthCm: string; // numeric string, cm
    paperHeightCm: string; // numeric string, cm
}

export const COMPANY_SETTING_KEYS: Record<keyof CompanySettings, string> = {
    name: 'company.name',
    address: 'company.address',
    phone: 'company.phone',
    whatsapp: 'company.whatsapp',
    email: 'company.email',
    footerNote: 'company.footerNote',
    signerName: 'company.signerName',
    logoUrl: 'company.logoUrl',
    bankAccountsNonPPN: 'company.bankAccountsNonPPN',
    bankAccountsPPN: 'company.bankAccountsPPN',
    paperWidthCm: 'company.paperWidthCm',
    paperHeightCm: 'company.paperHeightCm',
};

/** Roughly 4"–18" — covers every continuous form in practice. */
export const MIN_PAPER_CM = 10;
export const MAX_PAPER_CM = 45;

/**
 * Parse a stored paper dimension. Returns null for anything that is not a
 * sane form size so callers fall back to the env/default paper — a bad value
 * here would otherwise produce an unprintable ESC/P layout.
 */
export function parsePaperCm(value: string | undefined): number | null {
    if (!value) return null;
    const n = parseFloat(value);
    if (!Number.isFinite(n) || n < MIN_PAPER_CM || n > MAX_PAPER_CM) {
        return null;
    }
    return n;
}

/**
 * Read company overrides from AppSetting via the tenant-scoped prisma proxy.
 * Returns a partial map keyed by field name. Never throws — on any error it
 * returns an empty object so callers safely fall back to env defaults.
 */
export async function readCompanySettingOverrides(): Promise<
    Partial<CompanySettings>
> {
    try {
        const { prisma } = await import('@/lib/core/prisma');
        const rows = await prisma.appSetting.findMany({
            where: { key: { in: Object.values(COMPANY_SETTING_KEYS) } },
            select: { key: true, value: true },
        });
        if (rows.length === 0) return {};
        const byKey = new Map(rows.map((r) => [r.key, r.value]));
        const result: Partial<CompanySettings> = {};
        (
            Object.entries(COMPANY_SETTING_KEYS) as [
                keyof CompanySettings,
                string,
            ][]
        ).forEach(([field, key]) => {
            const val = byKey.get(key);
            if (val != null && val !== '') result[field] = val;
        });
        return result;
    } catch {
        return {};
    }
}

/**
 * Server-only: tenant-aware company config = env/subdomain defaults
 * (getCompanyConfigAsync) merged with per-tenant AppSetting overrides.
 * Print server components and route handlers should call THIS instead of
 * getCompanyConfigAsync when they want tenant overrides applied.
 */
export async function getCompanyConfigWithOverridesAsync() {
    const { getCompanyConfigAsync, parseBankAccounts } =
        await import('./company');
    const base = await getCompanyConfigAsync();
    const overrides = await readCompanySettingOverrides();
    const merged = {
        ...base,
        name: overrides.name ?? base.name,
        address: overrides.address ?? base.address,
        phone: overrides.phone ?? base.phone,
        whatsapp: overrides.whatsapp ?? base.whatsapp,
        email: overrides.email ?? base.email,
        footerNote: overrides.footerNote ?? base.footerNote,
        signerName: overrides.signerName ?? base.signerName,
        logoUrl: overrides.logoUrl ?? base.logoUrl,
        paperSize: {
            ...base.paperSize,
            widthCm:
                parsePaperCm(overrides.paperWidthCm) ?? base.paperSize.widthCm,
            heightCm:
                parsePaperCm(overrides.paperHeightCm) ??
                base.paperSize.heightCm,
        },
    };
    type BankAccount = { holder: string; bank: string; account: string };
    // Bank accounts: JSON stored in AppSetting; merge over env/base.
    if (overrides.bankAccountsNonPPN) {
        const parsed = parseBankAccounts(overrides.bankAccountsNonPPN) as
            | BankAccount[]
            | null;
        if (parsed && parsed.length > 0) merged.bankAccountsNonPPN = parsed;
    }
    if (overrides.bankAccountsPPN) {
        const parsed = parseBankAccounts(overrides.bankAccountsPPN) as
            | BankAccount[]
            | null;
        if (parsed && parsed.length > 0) merged.bankAccountsPPN = parsed;
    }
    return merged;
}
