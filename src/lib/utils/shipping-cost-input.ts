/**
 * Konversi isi kolom "Ongkos Kirim" menjadi angka yang aman untuk schema.
 *
 * `valueAsNumber` mengubah kolom kosong menjadi NaN, dan schema menolak NaN
 * tanpa pesan yang terlihat di UI sehingga form gagal tersimpan diam-diam.
 * Kolom kosong atau tidak valid diperlakukan sebagai 0 (tanpa ongkir).
 */
export function shippingCostFromInput(raw: unknown): number {
    if (typeof raw === 'number') {
        return Number.isFinite(raw) && raw > 0 ? raw : 0;
    }
    if (typeof raw !== 'string') return 0;
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
