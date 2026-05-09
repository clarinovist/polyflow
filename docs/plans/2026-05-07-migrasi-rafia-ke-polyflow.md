# Plan: Migrasi Rafia ke PolyFlow (melindo.polyflow.uk)

**Dibuat:** 7 Mei 2026
**Oleh:** Hermes Agent
**Status:** Draft — menunggu review

**Konfirmasi:**
- Server: Sama dengan kiyowo.polyflow.uk (VPS yang sama)
- Data sheet: Mulai September 2025
- Opening balance: Per Mei 2026
- Prioritas: Rafia saja, GJ & SKW tidak di-import

---

## Ringkasan

Migrasi data akuntansi, persediaan, dan HPP CV. Rafia dari 3 Google Sheets ke tenant PolyFlow baru di **melindo.polyflow.uk**. Prioritas eksklusif data Rafia — GJ & SKW tidak di-import.

---

## 1. Tenant Baru: melindo.polyflow.uk

### Konsep

PolyFlow sudah punya arsitektur **multi-tenant per database**. Setiap tenant punya:
- Subdomain sendiri (misal `kiyowo.polyflow.uk` → database kiyowo)
- Database PostgreSQL sendiri
- Routing otomatis via subdomain → tenant lookup → db switching

### Yang perlu dilakukan

| Step | Tugas | Tool |
|------|-------|------|
| 1.1 | Buat database PostgreSQL baru untuk Melindo | `createdb` di server |
| 1.2 | Provision tenant via `provision-tenant.ts` | `npx tsx scripts/provision-tenant.ts "Melindo" melindo <db_url>` |
| 1.3 | Seed admin user + COA default | `seed-tenant.ts` (sudah include di provision) |
| 1.4 | Setup DNS: `melindo.polyflow.uk` → VPS | DNS A record |
| 1.5 | Setup Nginx reverse proxy | Tambah server block baru |
| 1.6 | Verifikasi akses | Buka `melindo.polyflow.uk`, login |

### Output step 1
- Tenant Melindo aktif di `melindo.polyflow.uk` dengan database kosong + COA default + admin user
- Bisa akses dari browser

---

## 2. Import COA (Chart of Account) Rafia

### Sumber
- AKUNTANSI → tab **COA** (992 baris, 11 kolom)
- PENTING: hanya akun milik **Rafia** (bukan GJ & SKW)

### Cara baca COA sheet
COA sheet punya struktur:
```
COA        | KATEGORI | UNIT | -46.293,00 | 3.460.213.995,00 | 3.460.260.288,00 | b = Rafia
1-111 Kas  |          | RAFIA| Kas        | 47.590.543        | -                | a = GJ & SKW
```

Kolom yang relevan:
- **COA** — kode + nama akun (contoh: "1-111 Kas Besar")
- **b = Rafia** di header menandakan grup Rafia
- Kolom saldo untuk Rafia ada di salah satu kolom angka

### Tugas ETL

| Step | Detail |
|------|--------|
| 2.1 | Ekstrak semua akun dari COA sheet |
| 2.2 | Parse format "1-111 Kas Besar" jadi `Account.code` = "1-111", `Account.name` = "Kas Besar" |
| 2.3 | Map `Account.type` dari prefix kode (1=ASSET, 2=LIABILITY, 3=EQUITY, 4=REVENUE, 5=EXPENSE, 6=EXPENSE) |
| 2.4 | Map `Account.category` dari jenis akun |
| 2.5 | Identifikasi parent-child (1-111 anak dari 1-1xx) |
| 2.6 | Set `isCashAccount` untuk akun kas & bank |
| 2.7 | Ambil saldo Rafia saja (skip GJ & SKW) |
| 2.8 | Tulis journal entry untuk saldo awal (opening balance per COA) |

### Output step 2
- ~150-200 akun Rafia di tabel `Account`
- Opening balance journal entry untuk setiap akun dengan saldo > 0

---

## 3. Import Master Data Rafia

### 3.1 Customer (Pelanggan) — dari AKUNTANSI DATABASE

Data pelanggan ada di kolom A-G DATABASE. Tapi sheet ini **campur** antara pelanggan dan supplier dalam baris yang sama.

**Strategi:** Parse baris per baris. Jika kolom A (NAMA PELANGGAN) terisi → buat Customer.

| Step | Detail |
|------|--------|
| 3.1.1 | Filter baris yang punya NAMA PELANGGAN |
| 3.1.2 | Deduplikasi (cek nama, kontak) — data muncul di 3 file berbeda |
| 3.1.3 | Generate `Customer.code` (format: RAF-XXX) |
| 3.1.4 | Map kolom ke `Customer` model |
| 3.1.5 | Import ke PolyFlow |

### 3.2 Supplier (Pemasok) — dari AKUNTANSI DATABASE

Filter baris yang punya NAMA SUPPLIER (kolom H).

### 3.3 Product (Produk) — dari PERSEDIAAN DATABASE BAHAN

**Sumber utama:** PERSEDIAAN → DATABASE BAHAN DAN BARANG JADI (ada kolom "Jenis" untuk kategorisasi detail).

| Step | Detail |
|------|--------|
| 3.3.1 | Ekstrak semua produk dari PERSEDIAAN DATABASE BAHAN |
| 3.3.2 | Map `skuCode` = ProductCode (unik) |
| 3.3.3 | Map `primaryUnit` → enum PolyFlow (Kg→KG, Dus→PACK, Buah→PACK, Pcs→PACK, Roll→ROLL, ZAK→ZAK) |
| 3.3.4 | Tentukan `ProductType` dari kategori (RAW_MATERIAL, FINISHED_GOOD, PACKAGING, dll.) |
| 3.3.5 | Tentukan `Product.productType` dari kategori BARANG JADI / BAHAN BAKU / BAHAN PENOLONG / LAINNYA |
| 3.3.6 | Map akun COA dari kolom Dibeli dan Dijual ke `Account` |
| 3.3.7 | Import ke PolyFlow |

### 3.4 Employee (Karyawan) — dari AKUNTANSI DATABASE

Parse kolom KARYAWAN. Format: "1117-AGUS SUPRIYANTO" → kode + nama.

### 3.5 Location (Lokasi / Gudang)

| Step | Detail |
|------|--------|
| 3.5.1 | Buat location "Gudang Utama Rafia" |
| 3.5.2 | Buat location "Gudang RAFIA" |

### Output step 3
- ~50-100 Customers
- ~30-50 Suppliers
- ~200-500 Products & Variants
- ~20-50 Employees
- 2 Locations

---

## 4. Import Saldo Awal (Opening Balances)

### Sumber

| Data | Sumber | Tab |
|------|--------|-----|
| Saldo COA | AKUNTANSI | COA (kolom Rafia) |
| Piutang Customer | AKUNTANSI | AR/BUKU PIUTANG |
| Hutang Supplier | AKUNTANSI | AP/BUKU HUTANG |
| Piutang Karyawan | AKUNTANSI | BB PIUTANG KARYAWAN |
| Saldo Stok | PERHITUNGAN HPP | PERHITUNGAN SALDO AKHIR / RINGKASAN STOK |
| Saldo Kas & Bank | AKUNTANSI | BERITA ACARA KAS HARIAN |

### Strategi

Semua saldo awal di-import sebagai **satu Journal Entry besar** (Jurnal Pembuka / Opening Balance) dengan referenceType MANUAL_ENTRY.

**Format:**
```
Debit: 1-111 Kas Besar          Rp XX
Debit: 1-112 Kas Kecil         Rp XX
Debit: 1-115 Piutang Dagang    Rp XX
...
Credit: 3-111 Modal            Rp XX  (selisih)
```

### Output step 4
- Neraca saldo awal Rafia di PolyFlow
- Semua akun punya saldo yang match dengan sheet

---

## 5. Import Transaksi Historis

### 5.1 Jurnal Umum (General Ledger) — AKUNTANSI JURNAL

~20.000 baris. Ini adalah heart dari sistem akuntansi.

| Step | Detail |
|------|--------|
| 5.1.1 | Filter jurnal yang relevan untuk Rafia |
| 5.1.2 | Parse format: Tanggal, NO INV, NOMOR BUKTI, MEMO, AKUN, DEBIT, KREDIT |
| 5.1.3 | Kelompokkan per nomor bukti → satu `JournalEntry` |
| 5.1.4 | Map nama akun ke `Account` yang sudah di-import |
| 5.1.5 | Konversi format angka (hapus titik, ganti koma desimal) |
| 5.1.6 | Map `referenceType` dari JENIS TRANSAKSI (JURNAL MEMORIAL, JURNAL KAS DAN BANK, dll.) |
| 5.1.7 | Import batch (500 baris per batch) |

### 5.2 Jurnal Kas & Bank — AKUNTANSI JURNAL KAS DAN BANK

~9.700 baris. Detail transaksi kas dan bank. Struktur lebih detail (26 kolom).

### 5.3 Transaksi Stok — PERSEDIAAN INPUTAN DATA STOK MASUK/KELUAR

~9.400 baris pergerakan stok.

| Step | Detail |
|------|--------|
| 5.3.1 | Baca semua transaksi dari INPUTAN DATA STOK MASUK/KELUAR |
| 5.3.2 | Map NAMA BARANG → ProductVariant (via name matching) |
| 5.3.3 | STOK MASUK → `StockMovement` type = IN atau PURCHASE |
| 5.3.4 | STOK KELUAR → `StockMovement` type = OUT |
| 5.3.5 | Map AKTIFITAS → movement type (PEMBELIAN, PENJUALAN, LAINNYA, dll.) |
| 5.3.6 | Update `Inventory` quantity setelah setiap movement |
| 5.3.7 | Import batch |

### 5.4 Purchase Order & Invoice — AKUNTANSI PESANAN PEMBELIAN + AP/BUKU HUTANG

### 5.5 Sales Order & Invoice — AKUNTANSI PESANAN PENJUALAN + AR/BUKU PIUTANG

### 5.6 Aset Tetap — AKUNTANSI DAFTAR ASET TETAP

### Output step 5
- Semua transaksi historis Rafia ada di PolyFlow
- Inventory balance akurat
- Neraca dan laba rugi match dengan sheet asli

---

## 6. Rekonsiliasi & Verifikasi

### 6.1 Cek jumlah baris
- Jumlah akun COA match
- Jumlah customer, supplier, produk match
- Jumlah baris jurnal match

### 6.2 Cek saldo
- Saldo per COA di PolyFlow == saldo di sheet COA (kolom Rafia)
- Total debit == total kredit

### 6.3 Cek inventory
- Quantity per produk di `Inventory` == quantity di RINGKASAN STOK

### 6.4 Cek laporan
- Neraca percobaan (Trial Balance) balance
- Laba rugi masuk akal
- Laporan stok match

---

## 7. Non-Aktifkan Sheet Lama (Optional)

Setelah semua terverifikasi:
1. Backup 3 Google Sheets ke folder lokal
2. Tandai sheet sebagai "ARCHIVED — Migrated to PolyFlow"
3. Semua transaksi baru cukup di PolyFlow

---

## Estimasi Waktu & Volume

| Phase | Item | Volume | Estimasi |
|-------|------|--------|----------|
| 1 | Provision tenant | 1 tenant | 30 menit |
| 2 | Import COA Rafia | ~150-200 akun | 1-2 jam |
| 3 | Import master data | ~400-700 records | 2-3 jam |
| 4 | Saldo awal | ~50-100 akun bersaldo | 1-2 jam |
| 5.1 | Jurnal umum | ~20.000 baris | 3-4 jam |
| 5.2 | Jurnal kas & bank | ~9.700 baris | 1-2 jam |
| 5.3 | Transaksi stok | ~9.400 baris | 1-2 jam |
| 5.4 | PO + AP | ~2.100 baris | 1 jam |
| 5.5 | SO + AR | ~2.300 baris | 1 jam |
| 5.6 | Aset tetap | ~5.144 baris | 1 jam |
| 6 | Rekonsiliasi | — | 1-2 jam |
| **Total** | | | **~14-20 jam** |

---

## Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| Nama akun di JURNAL tidak match dengan COA | JournalLine gagal import | Buat mapping fallback; import saldo saja jika tidak match |
| Produk yang sama punya nama beda di 3 sheet | Duplikasi produk | Deduplikasi berdasarkan ProductCode (kolom S) |
| Format angka tidak konsisten | Parsing error | Bersihkan data dulu (pre-processing) |
| GJ & SKW tercampur |Data Rafia terkontaminasi| Filter ketat; skip semua baris yang merujuk GJ & SKW |
| Volume 20.000 baris jurnal | Timeout / memory | Import batch; jalankan di server bukan laptop |

---

## Catatan Tambahan

- **Tidak import GJ & SKW** — fokus Rafia saja. Jika suatu baris jurnal refer ke GJ & SKW, skip.
- **Dua entitas di COA sheet** — hanya ambil kolom grup Rafia. Kolom GJ & SKW diabaikan.
- **Data produk** — sumber utama dari PERSEDIAAN DATABASE BAHAN DAN BARANG JADI (kategorisasi lebih detail). Data dari AKUNTANSI DATABASE digunakan sebagai referensi silang.
- **Mapping COA Produk** — kolom "Dibeli" dan "Dijual" di DATABASE berisi nama akun COA → perlu di-resolve ke `Account` yang sudah di-import.
