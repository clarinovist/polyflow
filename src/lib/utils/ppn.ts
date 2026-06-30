/**
 * PPN (Pajak Pertambahan Nilai) Calculation Utilities
 *
 * Supports both INCLUDE and EXCLUDE PPN modes for B2B and B2C scenarios.
 */

export type PpnMode = 'INCLUDE' | 'EXCLUDE';

export interface PpnCalculation {
  /** Harga sebelum PPN (Dasar Pengenaan Pajak) */
  dpp: number;
  /** Jumlah PPN */
  taxAmount: number;
  /** Total harga termasuk PPN */
  total: number;
}

/**
 * Hitung PPN berdasarkan mode
 *
 * @param subtotal - Harga setelah diskon (sebelum PPN untuk exclude mode)
 * @param taxPercent - Persentase PPN (default 11%)
 * @param ppnMode - 'INCLUDE' atau 'EXCLUDE'
 * @returns PpnCalculation dengan dpp, taxAmount, dan total
 *
 * @example
 * // Exclude PPN (B2B)
 * calculatePpn(1000000, 11, 'EXCLUDE')
 * // → { dpp: 1000000, taxAmount: 110000, total: 1110000 }
 *
 * // Include PPN (B2C)
 * calculatePpn(1110000, 11, 'INCLUDE')
 * // → { dpp: 1000000, taxAmount: 110000, total: 1110000 }
 */
export function calculatePpn(
  subtotal: number,
  taxPercent: number = 11,
  ppnMode: PpnMode = 'EXCLUDE'
): PpnCalculation {
  if (subtotal <= 0 || taxPercent <= 0) {
    return { dpp: 0, taxAmount: 0, total: 0 };
  }

  if (ppnMode === 'INCLUDE') {
    // Harga sudah termasuk PPN
    // Contoh: Harga Rp 111.000 → DPP Rp 100.000, PPN Rp 11.000
    const dpp = Math.round((subtotal / (1 + taxPercent / 100)) * 100) / 100;
    const taxAmount = Math.round((subtotal - dpp) * 100) / 100;
    return { dpp, taxAmount, total: subtotal };
  } else {
    // Harga belum termasuk PPN (default)
    // Contoh: Harga Rp 100.000 → PPN Rp 11.000, Total Rp 111.000
    const dpp = subtotal;
    const taxAmount = Math.round((subtotal * (taxPercent / 100)) * 100) / 100;
    const total = Math.round((subtotal + taxAmount) * 100) / 100;
    return { dpp, taxAmount, total };
  }
}

/**
 * Hitung DPP (Dasar Pengenaan Pajak) dari harga include PPN
 *
 * @param priceIncludePpn - Harga yang sudah termasuk PPN
 * @param taxPercent - Persentase PPN (default 11%)
 * @returns DPP (harga tanpa PPN)
 */
export function extractDppFromInclude(priceIncludePpn: number, taxPercent: number = 11): number {
  return Math.round((priceIncludePpn / (1 + taxPercent / 100)) * 100) / 100;
}

/**
 * Hitung PPN dari DPP
 *
 * @param dpp - Dasar Pengenaan Pajak
 * @param taxPercent - Persentase PPN (default 11%)
 * @returns Jumlah PPN
 */
export function calculateTaxFromDpp(dpp: number, taxPercent: number = 11): number {
  return Math.round((dpp * (taxPercent / 100)) * 100) / 100;
}
