/**
 * Per-tenant kiosk feature flags.
 *
 * HD / Potong-Plong are film-bag processes (Kiyowo). Melindo raffia does not
 * use those floor forms — hide the hub tile and block direct routes.
 */

/** Tenants that show Proses Khusus (HD + Potong/Plong) on the kiosk hub. */
const PROSES_KHUSUS_TENANTS = new Set(['kiyowo']);

export function tenantHasProsesKhusus(subdomain: string | null | undefined): boolean {
  if (!subdomain) return false;
  return PROSES_KHUSUS_TENANTS.has(subdomain.toLowerCase());
}
