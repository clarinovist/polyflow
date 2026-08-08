/**
 * Rupiah input parsing — suffix layer on top of `parseIndonesianPrice`.
 *
 * `price-format.ts` already solves the hard part (dot-vs-comma thousands /
 * decimal ambiguity, "Rp" prefix). This file only adds a thin layer for
 * shorthand suffixes commonly typed by admin marketing when filling target
 * angka: `jt`/`juta` (juta), `rb`/`ribu` (ribu), `m`/`miliar` (miliar).
 *
 * Do NOT re-implement thousands/decimal parsing here — delegate the numeric
 * remainder to `parseIndonesianPrice`. See docs/plan/2026-08-08-redesign-
 * sales-routes-targets.md §0.3.
 */

import { parseIndonesianPrice } from '@/lib/utils/price-format';

/** Batas atas wajar untuk target/omzet — mencegah salah ketik ekstrem (mis. nambah nol). */
export const RUPIAH_MAX_VALUE = 999_999_999_999; // < 1 triliun

const SUFFIX_MULTIPLIERS: Record<string, number> = {
    juta: 1_000_000,
    jt: 1_000_000,
    ribu: 1_000,
    rb: 1_000,
    miliar: 1_000_000_000,
    m: 1_000_000_000,
};

// Alternation dicoba terurut, tapi anchor `$` di akhir membuat backtracking
// tetap menemukan sufiks yang benar terlepas dari urutan — tetap ditulis
// dari yang terpanjang untuk keterbacaan.
const SUFFIX_PATTERN = /^(-?[\d.,\s]+)\s*(juta|miliar|ribu|jt|rb|m)$/i;
const RP_PREFIX_PATTERN = /^rp\.?\s*/i;
const PLAIN_NUMERIC_PATTERN = /^-?[\d.,\s]+$/;

/**
 * Parse input rupiah bebas format ke number, atau `null` kalau tidak valid.
 *
 * Contoh yang harus benar (lihat plan §0.3 & §6):
 * - "450jt"          → 450_000_000
 * - "450 jt"         → 450_000_000
 * - "2,5M"           → 2_500_000_000  (koma = desimal, M = miliar)
 * - "2.500.000.000"  → 2_500_000_000  (titik = ribuan)
 *
 * Ditolak (return null): negatif, tidak bisa diparse jadi angka (NaN/garbage),
 * atau melebihi RUPIAH_MAX_VALUE.
 */
export function parseRupiah(raw: string | null | undefined): number | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const withoutPrefix = trimmed.replace(RP_PREFIX_PATTERN, '').trim();
    if (!withoutPrefix) return null;

    const suffixMatch = withoutPrefix.match(SUFFIX_PATTERN);

    let numeric: number;
    if (suffixMatch) {
        const numPart = suffixMatch[1].trim();
        const suffix = suffixMatch[2].toLowerCase();
        if (!/\d/.test(numPart)) return null;
        const base = parseIndonesianPrice(numPart);
        numeric = base * SUFFIX_MULTIPLIERS[suffix];
    } else {
        // Tanpa sufiks: seluruh sisa string harus berupa angka/pemisah saja.
        // Karakter lain (huruf sampah, simbol) = input kotor → tolak, bukan
        // diam-diam jadi 0 (parseIndonesianPrice sendiri mengembalikan 0
        // untuk NaN, jadi validasi "kotor" harus terjadi di sini).
        if (!PLAIN_NUMERIC_PATTERN.test(withoutPrefix)) return null;
        if (!/\d/.test(withoutPrefix)) return null;
        numeric = parseIndonesianPrice(withoutPrefix);
    }

    if (!Number.isFinite(numeric)) return null;
    if (numeric < 0) return null;
    if (numeric > RUPIAH_MAX_VALUE) return null;

    return numeric;
}
