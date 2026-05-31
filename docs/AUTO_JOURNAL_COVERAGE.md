# PolyFlow Auto-Journal Coverage Matrix

Dokumen ini memetakan status cakupan (coverage matrix) penjurnalan otomatis untuk seluruh peristiwa bisnis (business events) di PolyFlow.

Arsitektur PolyFlow menggunakan kombinasi penjurnalan otomatis sinkron untuk meminimalkan ambiguitas data keuangan.

| Bidang Bisnis | Peristiwa Bisnis (Event) | Status Implementasi | Modul Penanggung Jawab | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| **Sales** | Sales Invoice Created | `implemented` | `auto-journal-invoice-handlers` | Menjurnal Piutang Usaha vs Pendapatan Penjualan |
| | Sales Payment Received | `implemented` | `auto-journal-payment-handlers` | Menjurnal Kas/Bank vs Piutang Usaha |
| | Sales Return Received | `implemented` | `auto-journal-return-handlers` | Menjurnal Retur Penjualan vs Piutang Usaha / Kas |
| **Purchasing** | Purchase Invoice Created | `planned` | `auto-journal-invoice-handlers` | Akan menjurnal Hutang Dagang vs Persediaan / Beban |
| | Purchase Payment Disbursed | `implemented` | `auto-journal-payment-handlers` | Menjurnal Hutang Dagang vs Kas/Bank |
| | Purchase Return Shipped | `implemented` | `auto-journal-return-handlers` | Menjurnal Hutang Dagang vs Retur Pembelian |
| **Manufacturing** | Material Issued (BOM) | `delegated` | `AccountingService.recordInventoryMovement` | Dijurnal via pergerakan stok OUT (Bahan Baku ke WIP) |
| | Production Output Completed | `delegated` | `AccountingService.recordInventoryMovement` | Dijurnal via pergerakan stok IN (WIP ke Barang Jadi) |
| | Scrap Recorded | `delegated` | `AccountingService.recordInventoryMovement` | Dijurnal via pergerakan stok IN (Beban Scrap vs WIP) |
| **Inventory** | Stock Opname (Adjustment) | `delegated` | `AccountingService.recordInventoryMovement` | Dijurnal via pergerakan stok ADJUSTMENT (Gain/Loss) |
| | Internal Stock Movement | `planned` | *None* | Saat ini tidak menghasilkan efek jurnal keuangan (hanya perpindahan lokasi fisik) |

---

## Ketentuan Arsitektur & Source of Truth

1. **Jalur Tunggal (*Single Source of Truth*)**:
   Seluruh pergerakan stok fisik (penerimaan barang, konsumsi produksi, barang jadi, scrap, dan adjustment) dijurnal secara sinkron melalui `AccountingService.recordInventoryMovement(movement, tx)` di dalam transaksi database yang sama. Hal ini memastikan bahwa saldo stok fisik di gudang dan saldo keuangan di Buku Besar (GL) selalu sinkron tanpa risiko duplikasi atau kegagalan asinkron.
2. **Pola Delegasi Auto-Journal**:
   Method stub pada `AutoJournalService` untuk pergerakan stok fisik sengaja ditandai sebagai `@deprecated` dan didelegasikan secara penuh ke `AccountingService.recordInventoryMovement`.
