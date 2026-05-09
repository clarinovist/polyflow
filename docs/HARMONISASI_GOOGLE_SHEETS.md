# Harmonisasi Google Sheets → PolyFlow ERP

**Dibuat:** 7 Mei 2026
**Sumber:**
1. **AKUNTANSI** — `1l5mNovzS0Psi4Ym7mCTvCyTOT-XdxOVGDTcGNEc7ds8` (33 tabs)
2. **PERSEDIAAN** — `1L00v59AmQVKZyg-TogVk1qxA3sKwnovNlJtdUjUQjVA` (14 tabs)
3. **PERHITUNGAN HPP** — `1yEpLotX6Qp_M7mREKsePGMqRpUUZMWXV_HdW-vRVyBA` (16 tabs)

---

## Ringkasan

Ketiga file Google Sheets ini sebenarnya adalah **satu sistem akuntansi/manufaktur** yang terpecah karena keterbatasan spreadsheet. Data saling tumpang tindih, duplikasi, dan tanpa skema relasi. PolyFlow sudah punya model data yang mencakup semua fungsi ini — tujuannya adalah **memindahkan data & logika ke PolyFlow** tanpa kehilangan jejak audit.

---

## 1. Mapping Master Data

### 1.1 Customer (Pelanggan)

| Sumber Sheet | Tab | Kolom Sumber | PolyFlow Field | Catatan |
|---|---|---|---|---|
| AKUNTANSI | DATABASE | A: NAMA PELANGGAN | `Customer.name` | |
| AKUNTANSI | DATABASE | B: PIC | `Customer.notes` (PIC) | Bisa jadi field `contactPerson` jika ditambahkan ke skema |
| AKUNTANSI | DATABASE | C: EMAIL | `Customer.email` | |
| AKUNTANSI | DATABASE | D: TEL | `Customer.phone` | |
| AKUNTANSI | DATABASE | E: BILLING ADDRESS | `Customer.billingAddress` | |
| AKUNTANSI | DATABASE | F: SHIPPING ADDRESS | `Customer.shippingAddress` | |
| AKUNTANSI | DATABASE | G: NPWP / NIK | `Customer.taxId` | |
| PERSEDIAAN | DAFTAR PELANGGAN | (mirror data) | — | **Duplikasi** — jangan double import. Sumber utama = AKUNTANSI |
| PERHITUNGAN HPP | DAFTAR PELANGGAN | (mirror data) | — | **Duplikasi** — jangan import |

> **Total data:** ~200+ baris (estimasi dari 1000 row limit)

### 1.2 Supplier (Pemasok)

| Sumber Sheet | Tab | Kolom Sumber | PolyFlow Field | Catatan |
|---|---|---|---|---|
| AKUNTANSI | DATABASE | H: NAMA SUPPLIER | `Supplier.name` | |
| AKUNTANSI | DATABASE | I: PIC | `Supplier.notes` | |
| AKUNTANSI | DATABASE | J: EMAIL | `Supplier.email` | |
| AKUNTANSI | DATABASE | K: TEL | `Supplier.phone` | |
| AKUNTANSI | DATABASE | L: BILLING ADDRESS | `Supplier.address` | |
| AKUNTANSI | DATABASE | M: SHIPPING ADDRESS | `Supplier.address` (gabung) | |
| AKUNTANSI | DATABASE | N: TAXNUMBER | `Supplier.taxId` | |
| AKUNTANSI | DATABASE | O: BRANCHBANKNAME1 | `Supplier.bankName` | |
| AKUNTANSI | DATABASE | P: NAMEONBANKACCOUNT1 | — | Nama pemilik rekening |
| AKUNTANSI | DATABASE | Q: BANKACCOUNTNUMBER1 | `Supplier.bankAccount` | |

### 1.3 Product (Produk / Barang)

| Sumber Sheet | Tab | Kolom Sumber | PolyFlow Field | Catatan |
|---|---|---|---|---|
| AKUNTANSI | DATABASE | R: Name* | `Product.name` + `ProductVariant.name` | |
| AKUNTANSI | DATABASE | S: ProductCode | `ProductVariant.skuCode` | **Unik** — jadikan kode utama |
| AKUNTANSI | DATABASE | T: *Unit | `ProductVariant.primaryUnit` | Unit seperti Kg, Dus, Buah, Pcs, Roll, ZAK |
| AKUNTANSI | DATABASE | U: Dibeli | `ProductVariant.accounting` | Ini adalah **akun COA** untuk pembelian (mis. "1-134 Persediaan Alat Tulis") |
| AKUNTANSI | DATABASE | V: Dijual | `ProductVariant.accounting` | Akun COA untuk penjualan (mis. "4-106 Penjualan Bahan") |
| AKUNTANSI | DATABASE | W: ProductCategory | — | Bisa jadi `Product.productType` atau kategori |
| PERSEDIAAN | DATABASE BAHAN DAN BARANG JADI | A-G: Name, Code, Unit, Dibeli, Dijual, Kategori, Jenis | Sama dengan di atas | **Hampir identik** — tambah kolom "Jenis" yang lebih detail |
| PERHITUNGAN HPP | DATABASE BAHAN DAN BARANG JADI | (mirror data) | — | **Duplikasi** |

> **Data PERSEDIAAN lebih lengkap** untuk kategorisasi karena punya kolom "Jenis" (BARANG JADI KILOAN, ALAT TULIS, BAHAN PENOLONG, BAHAN BAKU PP, dll.)

### 1.4 Employee (Karyawan)

| Sumber Sheet | Tab | Kolom Sumber | PolyFlow Field | Catatan |
|---|---|---|---|---|
| AKUNTANSI | DATABASE | Z: KARYAWAN | `Employee.code` | Format: "1117-AGUS SUPRIYANTO" — kode + nama |
| AKUNTANSI | BB PIUTANG KARYAWAN | (data piutang karyawan) | `JournalEntry` | Piutang karyawan perlu migrasi ke jurnal |

### 1.5 Chart of Account (COA)

| Sumber Sheet | Tab | Kolom | PolyFlow Field | Catatan |
|---|---|---|---|---|
| AKUNTANSI | COA | A: COA (kode akun) | `Account.code` | Format: "1-111", "1-112", "4-106", dll. |
| AKUNTANSI | COA | B: KATEGORI | `Account.category` | |
| AKUNTANSI | COA | C-E: (data saldo) | `Account` atau `FiscalPeriod` | Ada 2 grup: RAFIA, GJ & SKW (dua entitas bisnis!) |
| PERHITUNGAN HPP | COA | A: COA | `Account.code` | Hanya 1 kolom — lebih sederhana |

> **PENTING:** COA sheet AKUNTANSI punya 2 kolom grup yang menandakan ada **dua entitas usaha** (Rafia dan GJ & SKW). Ini perlu diperhatikan di PolyFlow — mungkin perlu Tenant atau Location sebagai pemisah.

---

## 2. Mapping Transaksi

### 2.1 Jurnal Umum (General Ledger)

| Sumber Sheet | Tab | Kolom Sumber | PolyFlow Field | Catatan |
|---|---|---|---|---|
| AKUNTANSI | JURNAL | A: Tanggal | `JournalEntry.entryDate` | Format: "31 Agu 2025", "15 Sep 2025" |
| AKUNTANSI | JURNAL | B: NO INV/NO PO | `JournalEntry.reference` | |
| AKUNTANSI | JURNAL | C: NOMOR BUKTI TRANSAKSI | `JournalEntry.reference` (gabung) | Format: "BKM-27/09/25" (kode transaksi internal) |
| AKUNTANSI | JURNAL | D: MEMO | `JournalEntry.description` | |
| AKUNTANSI | JURNAL | E: AKUN | `JournalLine.accountId` | Nama akun (bisa di-resolve ke COA) |
| AKUNTANSI | JURNAL | F: DEBIT | `JournalLine.debit` | Nilai dalam Rupiah |
| AKUNTANSI | JURNAL | G: KREDIT | `JournalLine.credit` | Nilai dalam Rupiah |
| AKUNTANSI | JURNAL | H: CEK BALANCE | — | Bisa diverifikasi (running balance) |
| AKUNTANSI | JURNAL | I: JENIS TRANSAKSI | `JournalEntry.referenceType` | "JURNAL MEMORIAL", "JURNAL KAS DAN BANK", dll. |
| AKUNTANSI | JURNAL KAS DAN BANK | (26 kolom) | — | Data kas & bank yang lebih detail |

> **Volume:** ~20.000 baris di JURNAL + ~9.700 baris di JURNAL KAS DAN BANK

### 2.2 Stok (Inventory Movement)

| Sumber Sheet | Tab | Kolom Sumber | PolyFlow Field | Catatan |
|---|---|---|---|---|
| PERSEDIAAN | INPUTAN DATA STOK MASUK/KELUAR | A: TANGGAL | `StockMovement.createdAt` | |
| PERSEDIAAN | INPUTAN DATA STOK MASUK/KELUAR | B: AKTIFITAS | `StockMovement.type` | "LAINNYA", "PEMBELIAN", "PENJUALAN", dll. |
| PERSEDIAAN | INPUTAN DATA STOK MASUK/KELUAR | C: (angka 13) | — | Tidak jelas — mungkin kode? |
| PERSEDIAAN | INPUTAN DATA STOK MASUK/KELUAR | D: MEMO | `StockMovement.reference` | |
| PERSEDIAAN | INPUTAN DATA STOK MASUK/KELUAR | E: NAMA BARANG | `StockMovement.productVariantId` | -> resolve ke ProductVariant |
| PERSEDIAAN | INPUTAN DATA STOK MASUK/KELUAR | F: SATUAN | `ProductVariant.primaryUnit` | |
| PERSEDIAAN | INPUTAN DATA STOK MASUK/KELUAR | G: STOK MASUK | `StockMovement.quantity` (positive) | |
| PERSEDIAAN | INPUTAN DATA STOK MASUK/KELUAR | H: STOK KELUAR | `StockMovement.quantity` (negative) | |
| PERSEDIAAN | INPUTAN DATA STOK MASUK/KELUAR | I: KATEGORI | — | "BAHAN BAKU", "BARANG JADI", dll. |
| PERSEDIAAN | INPUTAN DATA STOK MASUK/KELUAR | J: JENIS | — | "BAHAN BAKU PP", "BAHAN BAKU PE", dll. |

> **Volume:** ~9.400 baris transaksi stok

PERHITUNGAN HPP juga punya tab **INPUTAN DATA STOK MASUK/KELUAR** (~9.400 baris) dengan struktur hampir sama — kemungkinan besar **data yang sama** dengan yang di PERSEDIAAN.

### 2.3 Pembelian (Purchasing)

| Sumber Sheet | Tab | Kolom | Keterangan |
|---|---|---|---|
| AKUNTANSI | PESANAN PEMBELIAN | (13 kolom) | Data PO pembelian — ~1.100 baris |
| AKUNTANSI | AP/BUKU HUTANG | (15 kolom) | Utang usaha & pembayaran — ~1.000 baris |
| AKUNTANSI | SUPPLIER LEDGER | (25 kolom) | Buku besar per supplier — ~2.000 baris |

### 2.4 Penjualan (Sales)

| Sumber Sheet | Tab | Kolom | Keterangan |
|---|---|---|---|
| AKUNTANSI | PESANAN PENJUALAN | (27 kolom) | Data SO penjualan — ~1.300 baris |
| AKUNTANSI | AR/BUKU PIUTANG | (19 kolom) | Piutang usaha & pembayaran — ~1.000 baris |
| AKUNTANSI | JPN | (41 kolom) | Jurnal Penjualan — ~2.000 baris |
| AKUNTANSI | PENYELESAIAN PESANAN | (11 kolom) | Fulfillment — ~2.000 baris |
| AKUNTANSI | PRINT INV / PRINT SJ | | Data cetak invoice & surat jalan |

### 2.5 HPP (Cost of Goods Sold)

| Sumber Sheet | Tab | Kolom | Keterangan |
|---|---|---|---|
| AKUNTANSI | HPP | (19 kolom) | Perhitungan HPP — ~2.481 baris |
| AKUNTANSI | LAPORAN HPP | (10 kolom) | Laporan HPP — ~2.248 baris |
| PERHITUNGAN HPP | PERHITUNGAN SALDO AKHIR | (9 kolom) | — ~1.850 baris |
| PERHITUNGAN HPP | STOK BBX, BKX, BPX, BJ COPY, BJ KILOANX, BJ REPACKX, LAINNYAX | (14-23 kolom) | Detail stok per kategori — ~500 baris per tab |
| PERHITUNGAN HPP | CATATAN SALDO AKHIR | (10 kolom) | — ~3.822 baris |

### 2.6 Fixed Assets (Aset Tetap)

| Sumber Sheet | Tab | Kolom | Keterangan |
|---|---|---|---|
| AKUNTANSI | DAFTAR ASET TETAP | (35 kolom) | Data aset — ~5.144 baris |
| AKUNTANSI | JURNAL PENYUSUTAN ASET | (8 kolom) | Depresiasi — ~5.144 baris |
| AKUNTANSI | MASA EKONOMIS ASET | (44 kolom) | — ~10.294 baris |

---

## 3. Struktur Buku Besar (COA → PolyFlow Account)

COA di AKUNTANSI menggunakan format **kode hierarkis**: `1-111 Kas Besar`

| Kode Prefix | Makna | PolyFlow AccountType |
|---|---|---|
| 1-1xx | Kas & Bank | `ASSET` / `CURRENT_ASSET` |
| 1-1xx | Piutang Dagang | `ASSET` / `CURRENT_ASSET` |
| 1-1xx | Pajak Dibayar Dimuka | `ASSET` / `CURRENT_ASSET` |
| 1-1xx | Persediaan | `ASSET` / `CURRENT_ASSET` |
| 2-1xx | Hutang Usaha | `LIABILITY` / `CURRENT_LIABILITY` |
| 3-1xx | Modal | `EQUITY` / `CAPITAL` |
| 4-1xx | Penjualan | `REVENUE` / `OPERATING_REVENUE` |
| 5-1xx | HPP | `EXPENSE` / `COGS` |
| 6-1xx | Beban | `EXPENSE` / `OPERATING_EXPENSE` |

> **Estimasi:** ~200-300 akun aktif di COA

---

## 4. Dua Entitas: Rafia vs GJ & SKW

**TEMUAN PENTING:** Sheet AKUNTANSI (COA) membagi data menjadi 2 grup:

| Grup | Keterangan |
|---|---|
| **RAFIA** | Kolom C/E di COA — saldo akun untuk entitas Rafia |
| **GJ & SKW** (a) | Kolom C/E — "a = GJ & SKW" |
| **RAFIA** (b) | Kolom — "b = Rafia" |

Ini berarti sistem spreadsheet saat ini mengelola **dua entitas bisnis** dalam satu file. PolyFlow perlu menangani ini dengan:
- Opsi 1: **Tenant terpisah** — satu tenant untuk Rafia, satu untuk GJ & SKW
- Opsi 2: **Location/Division** — satu tenant dengan dua divisi
- Opsi 3: **Satu tenant, dengan field entity pada transaksi**

---

## 5. Duplikasi & Redundansi Antar Sheet

| Data | Ada di | Masalah |
|---|---|---|
| Master produk | AKUNTANSI DATABASE, PERSEDIAAN DATABASE BAHAN, PERHITUNGAN HPP DATABASE BAHAN | **3 kali** — perlu deduplikasi |
| Daftar pelanggan | AKUNTANSI DATABASE, PERSEDIAAN DAFTAR PELANGGAN, PERHITUNGAN HPP DAFTAR PELANGGAN | **3 kali** |
| Transaksi stok | PERSEDIAAN INPUTAN STOK, PERHITUNGAN HPP INPUTAN STOK | **2 kali** — kemungkinan file PERSEDIAAN adalah feeder untuk file PERHITUNGAN HPP |
| COA | AKUNTANSI COA, PERHITUNGAN HPP COA | **2 kali** — versi AKUNTANSI lebih lengkap |
| Ringkasan stok | PERSEDIAAN RINGKASAN STOK, PERHITUNGAN HPP RINGKASAN STOK | **2 kali** |
| Mutasi per barang | PERSEDIAAN MUTASI PER BARANG, PERHITUNGAN HPP MUTASI PER BARANG | **2 kali** |

**Source of Truth yang disarankan:**
- **Master Data** → AKUNTANSI DATABASE (paling lengkap, ada pelanggan + supplier + produk)
- **Produk & Kategorisasi** → PERSEDIAAN DATABASE BAHAN DAN BARANG JADI (punya "Jenis" yang lebih detail)
- **COA** → AKUNTANSI COA (paling lengkap, ada 2 grup entitas)
- **Transaksi Stok** → PERSEDIAAN INPUTAN DATA STOK MASUK/KELUAR (yang pertama, bukan copy-nya)
- **Jurnal** → AKUNTANSI JURNAL (satu-satunya sumber jurnal)

---

## 6. Urutan Prioritas Migrasi

### Phase 1: Master Data (Foundation)
1. **COA** → `Account` di PolyFlow (200-300 akun)
2. **Supplier** → `Supplier` (deduplikasi dari AKUNTANSI DATABASE)
3. **Customer** → `Customer` (deduplikasi)
4. **Product** → `Product` + `ProductVariant` (sumber utama: PERSEDIAAN DATABASE BAHAN, dengan mapping COA dari AKUNTANSI DATABASE)
5. **Employee** → `Employee` (dari AKUNTANSI DATABASE kolom KARYAWAN)
6. **Location** → `Location` (gudang/divisi — Rafia vs GJ & SKW)

### Phase 2: Saldo Awal (Opening Balance)
1. **Saldo awal per COA** dari AKUNTANSI COA sheet
2. **Piutang** dari AR/BUKU PIUTANG
3. **Hutang** dari AP/BUKU HUTANG
4. **Piutang Karyawan** dari BB PIUTANG KARYAWAN
5. **Saldo stok awal** dari PERHITUNGAN HPP PERHITUNGAN SALDO AKHIR / RINGKASAN STOK

### Phase 3: Transaksi Historis (History)
1. **Jurnal umum** → `JournalEntry` + `JournalLine` (~20.000 baris)
2. **Stok movement** → `StockMovement` + `Inventory` update (~9.400 baris)
3. **PO Pembelian** → `PurchaseOrder` (~1.100 baris)
4. **SO Penjualan** → `SalesOrder` (~1.300 baris)
5. **Invoice** → `Invoice` (dari JPN / PRINT INV)
6. **Pembayaran** → `Payment`
7. **Aset Tetap & Depresiasi** → `FixedAsset`

### Phase 4: Aktifkan Otomatisasi di PolyFlow
HPP otomatis dari transaksi stok + jurnal
Jurnal otomatis dari PO/SO/Invoice
Laporan keuangan otomatis (Neraca, Laba Rugi, Arus Kas)

---

## 7. Perbedaan Format Data yang Perlu Ditangani

| Isu | Contoh | Solusi |
|---|---|---|
| **Separator ribuan** | `47.590.543`, `3.700,00` | Hapus `.` ribuan, ganti `,` jadi `.` decimal |
| **Format tanggal** | `31 Agu 2025`, `30 Sep 2025` | Parse ke ISO date; perlu mapping nama bulan Indonesia |
| **Nama akun campur COA** | "1-112 Kas Kecil" | Pisahkan kode (1-112) dan nama (Kas Kecil) |
| **Unit bervariasi** | Kg, Dus, Buah, Pcs, Roll, ZAK, PACK | Map ke enum PolyFlow (sudah ada: KG, ROLL, BAL, PACK, ZAK) |
| **Kode karyawan** | "1117-AGUS SUPRIYANTO" | Parse: kode "1117", nama "AGUS SUPRIYANTO" |
| **Beberapa supplier per baris** | "sjppt20@gmail.com, benyamin020378@gmail.com" | Pisahkan koma |
| **Beberapa no telp** | "0811 1001 0293; 0271 8203776" | Pisahkan dengan koma |
| **Dua entitas** | Rafia dan GJ & SKW di COA yang sama | Butuh pemisahan di PolyFlow |

---

## 8. Risiko & Catatan

1. **Volume data besar** — JURNAL 20.000+ baris perlu di-import batch (jangan sekaligus)
2. **Duplikasi tidak sempurna** — data di 3 file mungkin tidak persis sama; perlu validasi
3. **Referensi silang** — MAPPING tab (10.968 baris) di AKUNTANSI menghubungkan data dari berbagai tab; perlu dipahami dulu
4. **Jurnal otomatis** — ada tab JURNAL OTOMATIS yang berarti sebagian jurnal di-generate otomatis oleh formula Excel — logika ini perlu di-reproduksi di PolyFlow
5. **Dua entitas (Rafia & GJ & SKW)** — perlu konfirmasi apakah ini entitas legal terpisah atau hanya divisi
6. **Data tidak akan 100% identik** setelah migrasi karena perbedaan format, pembulatan, dan metode perhitungan — lakukan rekonsiliasi saldo setelah import
7. **PolyFlow sudah punya CostHistory** — untuk track perubahan cost/HPP secara otomatis, jadi manual mapping HPP dari Excel tidak perlu di-reproduksi persis

---

## Referensi PolyFlow Schema

| Model PolyFlow | Tabel di Prisma Schema |
|---|---|
| `Account` | `Account` — code, name, type, category, parentId |
| `Customer` | `Customer` — name, phone, email, billingAddress, shippingAddress, taxId |
| `Supplier` | `Supplier` — name, phone, email, address, taxId, bankName, bankAccount |
| `Product` | `Product` — name, productType |
| `ProductVariant` | `ProductVariant` — skuCode, primaryUnit, buyPrice, sellPrice, costingMethod |
| `Employee` | `Employee` — code, name, role |
| `Location` | `Location` — name, slug, locationType |
| `JournalEntry` | `JournalEntry` — entryDate, description, reference, referenceType, status |
| `JournalLine` | `JournalLine` — accountId, debit, credit, description |
| `StockMovement` | `StockMovement` — type, productVariantId, quantity, reference |
| `Inventory` | `Inventory` — locationId, productVariantId, quantity, averageCost |
| `SalesOrder` | `SalesOrder` — orderNumber, customerId, orderDate, status |
| `PurchaseOrder` | `PurchaseOrder` — orderNumber, supplierId, orderDate, status |
| `Invoice` | `Invoice` — invoiceNumber, salesOrderId, totalAmount, status |
| `FixedAsset` | `FixedAsset` — assetCode, name, category, purchaseValue, usefulLifeMonths |
