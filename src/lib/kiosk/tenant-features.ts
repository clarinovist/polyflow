/**
 * Per-tenant kiosk feature flags.
 *
 * HD / Potong-Plong are film-bag processes. Whether a tenant uses them is a
 * tenant-owned operational preference stored in AppSetting — not derived from
 * the tenant name or subdomain. Default is off (fail-closed).
 */

/** AppSetting key storing per-tenant Proses Khusus toggle (plain boolean string). */
export const KIOSK_PROSES_KHUSUS_SETTING_KEY = 'kiosk.prosesKhususEnabled';

/**
 * Parse the stored AppSetting value into an explicit boolean.
 * Never throws — missing/malformed values fail closed to `false`.
 */
export function isProsesKhususEnabled(
    raw: string | null | undefined,
): boolean {
    return raw === 'true';
}

/**
 * Structured parser for the kiosk tenant feature set.
 */
export function parseKioskTenantFeatures(
    raw: string | null | undefined,
): { hasProsesKhusus: boolean } {
    return { hasProsesKhusus: isProsesKhususEnabled(raw) };
}
