/**
 * Parse input desimal dengan toleransi format Indonesia.
 *
 * Kenapa file ini ada:
 * Operator gudang sering mengetik koma sebagai pemisah desimal, mis. "45,3"
 * untuk 45,3 kg. `parseFloat("45,3")` di JS mengembalikan 45 — diam-diam
 * memotong 0,3 kg per roll. Kesalahan ini tidak terdeteksi dan langsung
 * menjadi selisih stok + jurnal yang salah. Parser ini jadi jalur input
 * utama stock opname, jadi harus benar untuk format "45,3" dan menolak
 * input ambigu.
 *
 * Aturan:
 * - Trim dulu; string kosong / whitespace → null.
 * - Hanya karakter digit, titik, koma yang diizinkan; selain itu → null
 *   (menolak "abc", "12kg", "Infinity", "NaN", dll).
 * - Tanda minus di mana pun → null (jumlah fisik tidak pernah negatif).
 * - Jika ada titik DAN koma (pola ribuan jelas):
 *   - Separator yang muncul paling akhir dianggap desimal.
 *   - Kalau desimal = koma (Indonesia "1.234,5"): harus ada tepat 1 koma,
 *     titik boleh banyak sebagai ribuan → hapus semua titik, koma jadi titik.
 *   - Kalau desimal = titik (US "1,234.5"): harus ada tepat 1 titik,
 *     koma boleh banyak sebagai ribuan → hapus semua koma.
 *   - Kalau jumlah separator desimal >1 → null ("1,2,3" / "1.2.3").
 * - Jika hanya satu jenis separator:
 *   - Lebih dari satu → null.
 *   - Satu → perlakukan sebagai desimal (koma → titik).
 *   - Kalau ambigu seperti "1.234" (bisa ribuan atau desimal), perlakukan
 *     sebagai desimal → 1.234, karena angka timbangan jauh lebih sering
 *     desimal daripada ribuan.
 * - Hasil akhir harus finite, tidak NaN, dan >= 0.
 */
export function parseDecimalInput(raw: string): number | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;

    // Tolak negatif / plus di mana saja (jumlah fisik tidak negatif)
    if (trimmed.includes('-') || trimmed.includes('+')) return null;

    // Hanya digit, titik, koma yang diizinkan
    if (!/^[0-9.,]+$/.test(trimmed)) return null;

    const commaCount = (trimmed.match(/,/g) || []).length;
    const dotCount = (trimmed.match(/\./g) || []).length;

    let normalized: string;

    if (commaCount > 0 && dotCount > 0) {
        const lastComma = trimmed.lastIndexOf(',');
        const lastDot = trimmed.lastIndexOf('.');

        if (lastComma > lastDot) {
            // Indonesia: koma = desimal, titik = ribuan (1.234,5 → 1234.5)
            if (commaCount !== 1) return null;
            // Hapus semua titik, ganti koma jadi titik
            normalized = trimmed.replace(/\./g, '').replace(',', '.');
        } else {
            // US fallback: titik = desimal, koma = ribuan (1,234.5 → 1234.5)
            if (dotCount !== 1) return null;
            normalized = trimmed.replace(/,/g, '');
        }
    } else if (commaCount > 0) {
        // Hanya koma
        if (commaCount !== 1) return null;
        normalized = trimmed.replace(',', '.');
    } else if (dotCount > 0) {
        // Hanya titik
        if (dotCount !== 1) return null;
        normalized = trimmed;
    } else {
        // Hanya digit
        normalized = trimmed;
    }

    const value = Number(normalized);

    if (!isFinite(value) || isNaN(value)) return null;

    return value;
}
