/**
 * Shared plumbing for the per-document ESC/P builders.
 *
 * Each document gets its own module (`escp-invoice-document`,
 * `escp-delivery-document`); what they have in common — the return shape —
 * lives here. Routes stay thin and the bundle route prints exactly the same
 * bytes as the single-document routes, because there is one mapping per
 * document, not one per endpoint.
 *
 * See docs/plan/2026-08-07-escp-surat-jalan-dan-cetak-gabungan.md.
 */

import { getCompanyConfigWithOverridesAsync } from '@/lib/config/company-settings';

/** What a route needs back: the bytes, plus a name for the download file. */
export interface EscpDocument {
    bytes: number[];
    documentNumber: string;
}

export type CompanyConfig = Awaited<
    ReturnType<typeof getCompanyConfigWithOverridesAsync>
>;
