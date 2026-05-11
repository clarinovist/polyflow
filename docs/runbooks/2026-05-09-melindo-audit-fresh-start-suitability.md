# Audit Ringkas Tenant Melindo — Fresh Start Suitability

Updated: 2026-05-09
Mode: read-only audit via `scripts/tenant-psql-read.sh melindo`

## 1. Target yang diaudit
- Tenant slug: `melindo`
- Database: `melindo_rafia`
- Tujuan audit: menilai apakah tenant lebih cocok direpair atau di-zero-kan untuk fresh start.

## 2. Tabel inti terverifikasi ada
Tabel penting yang ada di DB:
- `Account`
- `JournalEntry`, `JournalLine`
- `Inventory`, `StockMovement`, `StockOpname`, `StockOpnameItem`
- `SalesOrder`, `Invoice`, `Payment`
- `PurchaseOrder`, `PurchaseInvoice`
- `FixedAsset`
- `Product`, `ProductVariant`
- `Customer`, `Supplier`, `User`, `Location`
- `Bom`, `BomItem`, `ProductionOrder`

## 3. Baseline jumlah data

### Master data
| Table | Count |
|---|---:|
| Account | 154 |
| Product | 4 |
| ProductVariant | 533 |
| Customer | 45 |
| Supplier | 10 |
| User | 1 |
| Location | 1 |

### Struktur/manufacturing master
| Table | Count |
|---|---:|
| Bom | 0 |
| BomItem | 0 |
| ProductionOrder | 0 |
| FixedAsset | 0 |

### Data transaksional
| Table | Count |
|---|---:|
| JournalEntry | 1,855 |
| JournalLine | 10,177 |
| Inventory | 187 |
| StockMovement | 9,781 |
| StockOpname | 0 |
| StockOpnameItem | 0 |
| SalesOrder | 352 |
| Invoice | 0 |
| Payment | 0 |
| PurchaseOrder | 1 |
| PurchaseInvoice | 0 |

## 4. Temuan kunci

### A. Ini bukan tenant kosong
DB berisi footprint transaksi besar:
- 1,855 journal entry
- 10,177 journal line
- 9,781 stock movement
- 352 sales order

Artinya tenant Melindo saat ini sudah terisi data historis material, bukan sekadar skeleton tenant.

### B. Struktur data terlihat “setengah migrasi / setengah placeholder”
Gejala kuat:
- `SalesOrder` ada 352 dan hampir semua non-zero total (`351` non-zero)
- `Invoice` = 0
- `Payment` = 0
- `PurchaseOrder` = 1 tapi `PurchaseInvoice` = 0
- `FixedAsset` = 0
- `Bom`, `BomItem`, `ProductionOrder` = 0

Interpretasi:
- ada data transaksi historis/manual yang masuk, tapi tidak membentuk siklus operasional PolyFlow yang utuh
- subledger AR/AP di modul operasional belum matang / belum selesai diinjeksi

### C. Inventory ada kuantitas, tapi valuation praktis nol
Temuan:
- `Inventory` = 187 rows
- semua 187 row punya `quantity > 0`
- `positive_qty_nonzero_cost = 0`
- `positive_qty_zero_or_null_cost = 187`
- total `inventory_value = 0.00`
- `StockMovement.cost IS NULL` = 9,781 rows

Interpretasi:
- stok ada secara kuantitas
- tapi layer cost/valuation tidak terbentuk
- ini membuat inventory accounting praktis tidak bisa dipercaya untuk dipakai sebagai baseline live

### D. Journal besar, tapi account mapping bukan COA PolyFlow standar sekarang
Contoh kode akun yang muncul:
- `1-115b` Piutang Dagang Rafia
- `2-110b` Hutang Dagang Rafia
- `1-130` Persediaan Bahan Baku Rafia
- `1-128` Persediaan Barang Jadi Rafia

Bukan pola kode standar PolyFlow live yang biasa kita pakai sekarang (`11120`, `11210`, `11310`, `30000`, dst).

Artinya:
- tenant ini memuat chart + jurnal historis hasil migrasi/manual import lama
- bukan setup opening-balance clean yang align dengan pola PolyFlow terbaru

### E. Journal profile mengarah ke import manual historis
- `JournalEntry.referenceType = MANUAL_ENTRY` sebanyak 1,854 dari 1,855 entry
- rentang tanggal: `2025-09-01` sampai `2026-05-07`
- contoh description sangat mirip jurnal historis yang diimport langsung dari pembukuan lama

Interpretasi:
- tenant ini lebih mirip database hasil migrasi pembukuan historis daripada tenant yang siap dipakai fresh secara native PolyFlow

### F. ProductVariant banyak, tapi costing kosong
- `ProductVariant` = 533
- `variants_with_standard_cost` = 0
- `variants_with_buy_price` = 0
- `variants_with_price` = 0

Interpretasi:
- variant master banyak, tapi pricing/cost basis belum siap dipakai untuk fresh operational costing

## 5. Kesimpulan audit

### Kesimpulan utama
Tenant `melindo_rafia` sangat kuat indikasinya **lebih cocok di-zero-kan pada level transaksi** daripada direpair angka satu-satu.

Alasan:
1. transaksi historis banyak dan tersebar
2. inventory quantity ada tapi valuation nol
3. stock movement cost semuanya null
4. AR/AP subledger operasional tidak terbentuk lengkap
5. journal bersifat manual import, bukan native transaction flow PolyFlow
6. costing product variant belum disiapkan

Dengan kondisi ini, repair akan mahal dan rawan menghasilkan basis yang tetap ambigu.

## 6. Rekomendasi keputusan

### Rekomendasi utama: Option B
**Pertahankan master data yang berguna, hapus / zero-kan data transaksional, lalu mulai fresh.**

Yang layak dipertahankan (subject to final review):
- Account / COA (perlu dinilai apakah mau pakai COA historis ini atau migrasi ke COA PolyFlow standar)
- Product + ProductVariant
- Customer
- Supplier
- User
- Location

Yang kandidat kuat untuk dibersihkan:
- JournalEntry / JournalLine
- Inventory
- StockMovement
- SalesOrder
- PurchaseOrder
- Invoice / Payment / PurchaseInvoice (walau sekarang nyaris kosong)
- kemungkinan tabel transaksi lain yang bergantung pada flow operasional

## 7. Catatan keputusan lanjutan yang perlu ditentukan
Sebelum eksekusi reset, masih perlu diputuskan:
1. COA tetap pakai yang sekarang atau dibersihkan ke COA PolyFlow standar?
2. ProductVariant 533 item tetap dipertahankan semua atau mau dipangkas?
3. Customer 45 dan Supplier 10 dipertahankan semua atau dipilih subset aktif?
4. Apakah fresh start ingin mulai dari opening balance via OBE + UI modules, atau benar-benar nol total tanpa saldo awal dulu?

## 8. Rekomendasi next step
Urutan aman:
1. backup database `melindo_rafia`
2. export pre-reset counts
3. review scope “master yang dipertahankan”
4. susun SQL cleanup transaksional FK-safe
5. execute reset
6. verify post-reset counts
7. lanjut desain opening balance fresh-start

## 9. Executive summary
Kalau tujuannya adalah “mulai fresh”, audit ini mendukung keputusan itu.

Bahasa sederhananya:
- **jangan repair angka yang ada satu-satu**
- **lebih masuk akal zero-kan transaksi dan pakai tenant ini sebagai wadah master data + fresh opening setup baru**
