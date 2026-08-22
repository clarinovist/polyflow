/**
 * Feature flag: reservasi stok untuk Sales Order.
 *
 * Melindo meminta reservasi SO dimatikan sementara agar perilaku stok
 * terlihat apa adanya (stok hanya berubah saat barang benar-benar keluar
 * lewat Surat Jalan). Reservasi WIP antar tahap produksi TIDAK terpengaruh
 * flag ini — itu mekanisme handoff SPK, bukan alokasi penjualan.
 *
 * Default: AKTIF (perilaku lama dipertahankan bila env tidak diset).
 * Set STOCK_RESERVATION_ENABLED=false untuk mematikan.
 */
export function isSalesStockReservationEnabled(): boolean {
    return process.env.STOCK_RESERVATION_ENABLED !== 'false';
}
