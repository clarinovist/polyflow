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
    email: string;
    footerNote: string;
    signerName: string;
    logoUrl: string;
}

export const COMPANY_SETTING_KEYS: Record<keyof CompanySettings, string> = {
    name: 'company.name',
    address: 'company.address',
    phone: 'company.phone',
    email: 'company.email',
    footerNote: 'company.footerNote',
    signerName: 'company.signerName',
    logoUrl: 'company.logoUrl',
};

/**
 * Read company overrides from AppSetting via the tenant-scoped prisma proxy.
 * Returns a partial map keyed by field name. Never throws — on any error it
 * returns an empty object so callers safely fall back to env defaults.
 */
export async function readCompanySettingOverrides(): Promise<Partial<CompanySettings>> {
    try {
        const { prisma } = await import('@/lib/core/prisma');
        const rows = await prisma.appSetting.findMany({
            where: { key: { in: Object.values(COMPANY_SETTING_KEYS) } },
            select: { key: true, value: true },
        });
        if (rows.length === 0) return {};
        const byKey = new Map(rows.map((r) => [r.key, r.value]));
        const result: Partial<CompanySettings> = {};
        (Object.entries(COMPANY_SETTING_KEYS) as [keyof CompanySettings, string][]).forEach(
            ([field, key]) => {
                const val = byKey.get(key);
                if (val != null && val !== '') result[field] = val;
            },
        );
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
    const { getCompanyConfigAsync } = await import('./company');
    const base = await getCompanyConfigAsync();
    const overrides = await readCompanySettingOverrides();
    return {
        ...base,
        name: overrides.name ?? base.name,
        address: overrides.address ?? base.address,
        phone: overrides.phone ?? base.phone,
        email: overrides.email ?? base.email,
        footerNote: overrides.footerNote ?? base.footerNote,
        signerName: overrides.signerName ?? base.signerName,
        logoUrl: overrides.logoUrl ?? base.logoUrl,
    };
}
