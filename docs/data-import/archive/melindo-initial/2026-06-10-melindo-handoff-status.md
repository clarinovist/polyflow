# Handoff Status — Melindo Initial Data & Opening Balance

Tanggal: 2026-06-10
Project: Initial data setup tenant Melindo (`melindo_rafia`)
DB host: `173.249.28.105`
Container DB: `polyflow-db`
DB user: `polyflow`
Tenant DB: `melindo_rafia`

## 1. Ringkasan status saat ini

Yang sudah benar-benar masuk ke DB Melindo:
1. Customer
2. Supplier
3. Product `BARANG JADI`

Yang belum masuk ke DB, masih tahap audit/staging/draft:
1. Opening balance / saldo awal
2. Journal opening balance
3. AR opening
4. AP opening
5. Inventory opening
6. Fixed asset opening

## 2. Hasil yang sudah berhasil dieksekusi

### Customer
- Import real berhasil
- Hasil:
  - 17 updated
  - 129 inserted
  - total staging 146 row
- Verifikasi total customer di DB/UI:
  - 174 customer

### Supplier
- Import real berhasil
- Hasil:
  - 9 updated
  - 44 inserted
  - total staging 53 row
- Verifikasi total supplier di DB/UI:
  - 54 supplier

### Product BARANG JADI
- Import/update real berhasil
- Hasil:
  - 305 existing variant di-update
  - 30 variant baru di-insert
- Verifikasi:
  - FG variant total = 339
  - variant baru prefix `MLD-BJ-*` = 30

Backup sebelum import produk:
- `/opt/backups/polyflow/melindo_melindo_rafia_20260610_090824.sql.gz`

## 3. Keputusan penting yang sudah disepakati

### Naming produk Melindo
- Contoh: `Rafia Bening Super 0,75 (6)` = 0.75 kg per pcs, 6 pcs per bal
- Koma decimal adalah format nama yang benar
- Titik decimal dalam nama adalah typo admin
- Nama `0,75` dan `0.75` dianggap produk yang sama

### Unit normalization
- `Pack` -> `PCS`
- `Karton` -> `PCS`

### SKU fallback untuk produk baru
- Untuk row produk baru / unresolved yang perlu SKU aman, dipakai namespace sementara:
  - `MLD-BJ-###`

### Opening balance blocker decisions
- `1-121 Konstruksi dalam Pengerjaan` -> sementara ke `1-199 Rekening Sementara`
- `2-390 Hutang ke Nugroho Pramono` -> tetap sebagai liability
- `3-201b Laba Tahun Berjalan` -> map ke `3-200b Laba Ditahan Rafia`
- Row saldo nol -> skip

## 4. Temuan penting untuk saldo awal

### NERACA source sheet sekarang sudah balance
- Recheck Google Sheet terbaru menunjukkan:
  - `TOTAL ASET` = 3,497,041,722
  - `TOTAL HUTANG & EKUITAS` = 3,497,041,722
  - check cell `B57` = `TRUE`
  - `B58` tinggal floating remainder Excel sangat kecil (praktis nol)
- Imbalance lama `115,424,057` sudah tidak berlaku lagi
- Suspense `MIG-DIFF` ke `1-199` tidak diperlukan lagi pada staging terbaru

### LABA TAHUN BERJALAN sudah berubah dari sheet sebelumnya
- NERACA `3-201b Laba Tahun Berjalan` sekarang = 172,978,343.45
- Sebelumnya dipakai 179,711,418.12
- Artinya semua artifact opening balance harus pakai angka terbaru, bukan draft lama

### Implikasi ke staging
- Summary opening balance final sekarang balance tanpa suspense
- Draft journal-only + module bridge juga harus direfresh mengikuti angka baru ini

## 5. File-file penting yang sudah dibuat

### Master/Product import
- `docs/data-import/melindo-initial/melindo-product-continuation-plan.md`
- `docs/data-import/melindo-initial/melindo-barang-jadi-resolution-worklist.csv`
- `docs/data-import/melindo-initial/melindo-barang-jadi-resolution-worklist-refined.csv`
- `docs/data-import/melindo-initial/melindo-barang-jadi-manual-review-required-refined.csv`
- `docs/data-import/melindo-initial/melindo-barang-jadi-manual-review-recommended.csv`
- `docs/data-import/melindo-initial/melindo-barang-jadi-recommended-final-decisions.md`
- `docs/data-import/melindo-initial/melindo-barang-jadi-resolved-staging.csv`
- `docs/data-import/melindo-initial/melindo-barang-jadi-final-existing-updates.csv`
- `docs/data-import/melindo-initial/melindo-barang-jadi-final-new-inserts.csv`

### SQL product import
- `docs/data-import/melindo-initial/sql/melindo-barang-jadi-import.sql`
- `docs/data-import/melindo-initial/sql/melindo-barang-jadi-import-dry-run.sql`
- `docs/data-import/melindo-initial/sql/melindo-barang-jadi-import-verify.sql`

### Opening balance audit & staging
- `docs/data-import/melindo-initial/melindo-opening-balance-audit.md`
- `docs/data-import/melindo-initial/melindo-opening-balance-blocker-recommendations.md`
- `docs/data-import/melindo-initial/melindo-opening-balance-neraca-staging.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-final-staging.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-final-staging-summary.json`
- `docs/data-import/melindo-initial/melindo-opening-balance-final-execution-pack.md`

### Package per bucket opening balance
- `docs/data-import/melindo-initial/melindo-opening-balance-journal_only.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-ar_module.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-ap_module.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-inventory_module.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-fixed_asset_module.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-review_owner_liability.csv`

### Audit schema transaksi akuntansi
- `docs/data-import/melindo-initial/melindo-accounting-transaction-schema-audit.md`

### Journal opening package
- `docs/data-import/melindo-initial/melindo-opening-balance-journal-package.md`
- `docs/data-import/melindo-initial/melindo-opening-balance-journal-lines.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-journal-lines-summary.json`
- `docs/data-import/melindo-initial/melindo-opening-balance-journal-lines-balanced-draft.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-journal-lines-balanced-summary.json`
- `docs/data-import/melindo-initial/sql/melindo-opening-balance-journal-draft.sql`
- `docs/data-import/melindo-initial/sql/melindo-opening-balance-journal-draft-dry-run.sql`

## 6. Kondisi schema transaksi akuntansi live saat audit

Row count live saat audit:
- `JournalEntry` = 0
- `JournalLine` = 0
- `SalesOrder` = 0
- `Invoice` = 0
- `Payment` = 0
- `PurchaseOrder` = 0
- `PurchaseInvoice` = 0
- `PurchasePayment` = 0
- `Inventory` = 0
- `StockMovement` = 0
- `StockOpname` = 0
- `FixedAsset` = 0

Artinya tenant transaksi masih clean slate.

Lokasi live yang tersedia saat audit:
- `Gudang Utama` (`slug = gudang-utama`)

## 7. Status journal opening package

### Raw journal-only package (posted)
- Line count: 20
- Debit total: 819,356,831.56
- Credit total: 1,877,367,460.17
- Difference: -1,058,010,628.61
- `2-390 Hutang ke Nugroho Pramono` sudah dikonfirmasi user sebagai hutang owner, jadi ikut dimasukkan lagi ke package jurnal

### Balanced draft journal package (posted)
- Ditambahkan 1 bridge line debit ke `1-199 Rekening Sementara`
- Amount bridge: 1,058,010,628.61
- Hasil akhir:
  - line count: 21
  - final debit total: 1,877,367,460.17
  - final credit total: 1,877,367,460.17
  - difference: 0.00

Hasil eksekusi nyata ke DB:
- `JournalEntry` berhasil terbuat 1 row dengan `entryNumber = OB-MEL-2026-0001`
- `JournalLine` berhasil terbuat 21 row
- Verifikasi total debit = total credit = 1,877,367,460.17
- Dry-run sempat menemukan bug SQL (`missing FROM-clause entry for table je`) dan draft SQL sudah diperbaiki lalu dieksekusi sukses

## 8. Rekomendasi next step saat lanjut nanti

Urutan terbaik saat lanjut lagi:
1. Bangun `AR opening package`
   - target chain: `SalesOrder` -> `Invoice`
2. Bangun `AP opening package`
   - target chain: `PurchaseOrder` -> `PurchaseInvoice`
3. Bangun `Inventory opening package`
   - target: `StockOpname` / `StockOpnameItem` untuk `Gudang Utama`
   - cost/OBE harus dirancang hati-hati
4. Bangun `FixedAsset opening package`
   - target: `FixedAsset`
5. Setelah seluruh package modul siap, baru review apakah:
   - journal draft dijalankan dulu dengan bridge, atau
   - seluruh opening diposting dalam satu rencana migrasi berurutan

## 9. Kesimpulan singkat

Sudah masuk ke DB:
- Customer
- Supplier
- Product BARANG JADI

Belum masuk ke DB:
- seluruh saldo awal / accounting opening

Namun seluruh fondasi saldo awal sudah disiapkan:
- audit
- staging
- bucket split
- keputusan blocker
- draft package jurnal
- audit schema transaksi live

Jadi saat melanjutkan nanti, pekerjaan tinggal masuk ke package modul opening balance, bukan mengulang discovery dari nol.
