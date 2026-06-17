# Melindo Opening Balance — Full Handoff Document

Tanggal: 12 Juni 2026
Database: `polyflow_melindojaya` (container `polyflow-db`, port 5434)
User: admin@melindojaya.com (ID: 64027d0b-84ed-4e3c-85ef-0f8d8cb9ad8e)

---

## 1. Ringkasan Eksekusi

Semua bucket opening balance sudah diimport ke database. Data bersumber dari Google Sheets:
`https://docs.google.com/spreadsheets/d/1cXysOGPjR03xzMatQrV-qA-fNBZwRYdlgd0nzHJWO_E`

### Tabs di Google Sheets:
| Tab | GID | Isi |
|-----|-----|-----|
| Panduan | 625188486 | Instruksi pengisian |
| AR_opening | 1172376231 | Detail piutang per customer/invoice |
| AP_opening | 1924522132 | Detail hutang per supplier/tagihan |
| Inventory_opening | 971785105 | Detail persediaan per item |
| FixedAsset_opening | 548506307 | Detail aset tetap per aset |
| NR_opening | 1759784091 | Neraca (balance sheet) target |
| LR_Opening | 2005254331 | Laporan Laba Rugi (belum diimport) |

---

## 2. Status Per Bucket

### 2.1 Journal-Only Bucket ✓
Diposting sebagai JE 204. Berisi akun-akun yang tidak perlu detail transaksi:
- Kas Kecil (11110): Rp 22,692,765.60
- Bank Mandiri (11130): Rp 9,169,510.98
- Bank BCA (11120): Rp 635,383.70
- Pajak Dibayar Dimuka (11500): Rp 647,584,521.00
- Piutang Karyawan (11600): Rp 15,040,000.00
- CIP (11700): Rp 8,165,000.00
- Sewa Dibayar Dimuka (11450): Rp 51,502,003.00
- Uang Muka Supplier (11800): Rp 45,204,715.54
- PPN Keluaran (21310): Rp 667,916,028.48
- Laba Ditahan (32000): Rp 355,473,088.24
- Laba Tahun Berjalan (33000): Rp 172,978,343.45
- Equity Offset (30000): Rp 396,373,560.35 (debit)

### 2.2 AP Module ✓
106 invoices, 9 supplier, total Rp 1,604,281,151.
Supplier: FADILA (92), INTERA LESTARI (5), BAHANA BUANABOX (2), SAHABAT ABADI (2), SB PLAST (dihapus), SOLO MULTIPACKING (1), KEISHA CHEMICLAS (1), RUKUN SEJAHTERA (1), GUWATIRTA SEJAHTERA (2).

**Koreksi yang sudah dilakukan:**
- `02/F-BN/II/26` (Fadila): 1,446,000 → 14,416,000
- `004/F-BN/II/26` (Fadila): 22,950 → 22,950,000
- `SBP001/04/2026` (SB Plast): 157,125,000 → 15,712,500 → **akhirnya dihapus** karena sudah tidak ada di sheets

### 2.3 AR Module ✓
11 invoices, 10 customer, total Rp 192,527,366.
Customer: WAHYU PURNO WIDODO (2 invoice), WIDOKO, HILAL GEMILANG KHAIR, JOY PLASTIK, RIBUT SNACK, SAUDIN, RUKUN SEJAHTERA, SANTOSO JAYA PLASTIK, SAHABAT ABADI, BAROKAH PLASTIK.

### 2.4 Inventory Module ✓
190 items, 6 kategori, total Rp 746,974,880 (setelah koreksi).

| Kategori | ProductType | Items | Total |
|----------|-------------|-------|-------|
| Barang Jadi | FINISHED_GOOD | 56 | Rp 190,636,003 |
| Bahan Baku | RAW_MATERIAL | 47 | Rp 429,304,569 |
| Bahan Kemasan | PACKAGING | 54 | Rp 92,185,052 |
| Bahan Penolong | RAW_MATERIAL | 8 | Rp 3,308,333 |
| Barang Dalam Proses | WIP | 1 | Rp 26,546,600 |
| Lainnya | RAW_MATERIAL | 24 | Rp 4,994,323 |

**Koreksi yang sudah dilakukan:**
- Pewarna Putih: harga_satuan 2,600,000 → 26,000 (koreksi kelebihan 100x)
- Rafia Hitam KW: harga_satuan 8,874 → 9,562

**Lokasi:** 2 gudang — Gudang Utama (finished goods, packaging, supplies) dan Gudang Barat (raw materials).

**Mapping akun inventory:**
- 11310 Raw Materials → Bahan Baku + Bahan Penolong
- 11320 Work-in-Progress → Barang Dalam Proses
- 11330 Finished Goods → Barang Jadi
- 11340 Packaging Materials → Bahan Kemasan
- 11300 Inventory → Lainnya

### 2.5 Fixed Asset Module ✓
90 aset, 4 kategori, gross Rp 3,030,119,889.

| Kategori | Items | Purchase Value | Acc. Depreciation |
|----------|-------|----------------|-------------------|
| Mesin | 50 | Rp 2,167,648,880 | Rp 1,041,676,546 |
| Bangunan | 7 | Rp 493,197,000 | Rp 102,800,191 |
| Peralatan Kantor | 31 | Rp 98,993,009 | Rp 88,818,716 |
| Kendaraan | 1 | Rp 27,000,000 | Rp 1,687,500 |

**Akun yang dibuat untuk fixed assets:**
- 12400 Office Equipment (baru)
- 12490 Accumulated Depreciation - Office Equipment (baru)
- 53110 Building Depreciation (baru)
- 53120 Vehicle Depreciation (baru)
- 53130 Office Equipment Depreciation (baru)

**Koreksi yang sudah dilakukan:**
- Mesin Extruder A (Rp 350M) → dihapus dari DB karena sudah dihapus dari sheets
- Gudang Bahan (Rp 106.7M) → ditambahkan ke DB karena ada di sheets

### 2.6 Owner Liability ✓
1 entry: `2-390 Hutang ke Nugroho Pramono` = Rp 681,000,000.
Diposting sebagai JE 201: Debit Equity, Credit 2-390.

---

## 3. Trial Balance Saat Ini

Total Debit = Total Credit = Rp 8,912,905,696 ✓

### Akun dengan saldo:

| Code | Name | Balance |
|------|------|---------|
| 11110 | Petty Cash | 22,692,766 |
| 11120 | Bank BCA | 635,384 |
| 11130 | Bank Mandiri | 9,169,511 |
| 11210 | Trade Receivables | 192,527,366 |
| 11300 | Inventory (Lainnya) | 4,994,323 |
| 11310 | Raw Materials | 432,612,902 |
| 11320 | Work-in-Progress | 26,546,600 |
| 11330 | Finished Goods | 190,636,003 |
| 11340 | Packaging Materials | 92,185,052 |
| 11450 | Sewa Dibayar Dimuka | 51,502,003 |
| 11500 | Pajak Dibayar Dimuka | 647,584,521 |
| 11600 | Piutang Karyawan | 15,040,000 |
| 11700 | CIP | 8,165,000 |
| 11800 | Uang Muka Supplier | 45,204,716 |
| 12100 | Machinery | 2,167,648,880 |
| 12190 | Acc. Depr. Machinery | -1,041,676,546 |
| 12200 | Buildings | 493,197,000 |
| 12290 | Acc. Depr. Buildings | -102,800,191 |
| 12300 | Vehicles | 27,000,000 |
| 12390 | Acc. Depr. Vehicles | -1,687,500 |
| 12400 | Office Equipment | 98,993,009 |
| 12490 | Acc. Depr. Office Equip | -88,818,716 |
| 2-390 | Hutang Nugroho | -681,000,000 |
| 21110 | Trade Payables | -1,604,281,151 |
| 21310 | VAT Output | -667,916,028 |
| 30000 | Opening Balance Equity | 190,296,530 |
| 32000 | Retained Earnings | -355,473,088 |
| 33000 | Current Year Earnings | -172,978,343 |

---

## 4. Reconciliation: Sheets vs DB

**STATUS: 100% MATCH ✓**

Semua data di detail tabs (AP_opening, AR_opening, Inventory_opening, FixedAsset_opening) sudah sinkron dengan database.

```
Bucket                       Sheets                 DB    Match
---------------------------------------------------------------------------
AP Module              1,604,281,151      1,604,281,151        ✓
AR Module                192,527,366        192,527,366        ✓
FA: MESIN              2,167,648,880      2,167,648,880        ✓
FA: BANGUNAN             493,197,000        493,197,000        ✓
FA: KENDARAAN             27,000,000         27,000,000        ✓
FA: PERALATAN KANTOR      98,993,009         98,993,009        ✓
Inv: Barang Jadi         190,636,003        190,636,003        ✓
Inv: Bahan Baku          429,304,569        429,304,569        ✓
Inv: Bahan Kemasan        92,185,052         92,185,052        ✓
Inv: BDP                 26,546,600         26,546,600        ✓
Inv: Lainnya              4,994,323          4,994,323        ✓
Inv: Bahan Penolong       3,308,333          3,308,333        ✓
---------------------------------------------------------------------------
TOTAL                 5,330,622,286      5,330,622,286        ✓
```

---

## 5. NR_opening vs DB — Gap yang Perlu Diselesaikan

NR_opening (tab neraca) **belum diupdate** untuk match dengan detail tabs. Berikut nilai yang perlu diupdate di kolom B tab NR_opening:

| Cell | Akun | NR Lama | NR Baru (dari DB) | Alasan |
|------|------|---------|-------------------|--------|
| B15 | 1-121 CIP | 0 | 8,165,000 | Ada data CIP di sheets |
| B19 | 1-125 Bahan Penolong | 3,650,432 | 3,308,333 | Harga terkoreksi |
| B20 | 1-126 Barang Jadi | 308,169,441 | 190,636,003 | Sheets punya data terbaru |
| B22 | 1-130 Bahan Baku | 415,987,052 | 429,304,569 | Sheets lebih lengkap |
| B23 | 1-131 Bahan Kemasan | 118,213,686 | 92,185,052 | Sheets lebih akurat |
| B28 | 1-212 Bangunan | 386,478,000 | 493,197,000 | Gudang Bahan baru ditambah |
| B29 | 1-213 Mesin | 2,201,648,880 | 2,167,648,880 | Extruder A dihapus |
| B32 | 1-216 Akum Bangunan | -95,501,581 | -102,800,191 | Depr lebih update |
| B33 | 1-217 Akum Mesin | -921,353,337 | -1,041,676,546 | Depr lebih update |
| B34 | 1-218 Akum Kendaraan | -843,750 | -1,687,500 | Depr lebih update |
| B35 | 1-219 Akum Peralatan | -84,807,798 | -88,818,716 | Depr lebih update |

**TOTAL ASET LANCAR** juga perlu diupdate dari 3,481,696,221 ke nilai baru.

**Catatan:** NR tidak balance karena Opening Balance Equity (30000) senilai Rp 190M adalah akun system yang tidak ditampilkan di NR. Akun ini akan di-close ke Laba Ditahan saat periode akuntansi ditutup.

---

## 6. Journal Entries yang Sudah Dibuat

| JE | Description | Debit | Credit |
|----|-------------|-------|--------|
| JE 001-107 | Opening Balance AP (106 invoices) | 1,604,281,151 | 1,604,281,151 |
| JE 108-118 | Opening Balance AR (11 invoices) | 192,527,366 | 192,527,366 |
| JE 200 | Opening Balance Fixed Assets | 3,030,119,889 | 3,030,119,889 |
| JE 201 | Owner Liability (2-390) | 681,000,000 | 681,000,000 |
| JE 202 | Opening Balance Inventory | 1,493,887,730 | 1,493,887,730 |
| JE 203 | Inventory Correction (Pewarna Putih) | 747,489,600 | 747,489,600 |
| JE 204 | Journal Only (Cash, Bank, Prepaid, Equity) | 1,196,367,460 | 1,196,367,460 |
| JE 206 | FA Correction (Remove Extruder A) | 350,000,000 | 350,000,000 |
| JE 207 | FA Addition (Gudang Bahan) | 106,719,000 | 106,719,000 |
| JE 208 | FA Correction JE (Remove Extruder) | 350,000,000 | 350,000,000 |
| JE 209 | FA Addition JE (Gudang Bahan) | 106,719,000 | 106,719,000 |
| JE 210 | Inventory Price Fix (Rafia Hitam KW) | 576,750 | 576,750 |

---

## 7. Akun yang Dibuat Baru

### Untuk Journal-Only:
- 11450 Sewa Dibayar Dimuka
- 11500 Pajak Dibayar Dimuka
- 11600 Piutang Karyawan
- 11700 Konstruksi dalam Pengerjaan
- 11800 Uang Muka ke Supplier

### Untuk Fixed Assets:
- 12400 Office Equipment
- 12490 Accumulated Depreciation - Office Equipment
- 53110 Building Depreciation
- 53120 Vehicle Depreciation
- 53130 Office Equipment Depreciation

### Untuk Owner Liability:
- 2-390 Hutang ke Nugroho Pramono

### System accounts:
- 30000 Opening Balance Equity (auto-created)

---

## 8. Master Data yang Dibuat

### Suppliers (9):
SUP-FADILA, SUP-SBPLAST, SUP-INTERA, SUP-SOLOMP, SUP-BAHANA, SUP-SAHABAT, SUP-KEISHA, SUP-RUKUN, SUP-GUWATIRTA

### Customers (10):
JOY PLASTIK, SANTOSO JAYA PLASTIK, SAUDIN, SAHABAT ABADI, HILAL GEMILANG KHAIR, RUKUN SEJAHTERA, WIDOKO, RIBUT SNACK, WAHYU PURNO WIDODO, BAROKAH PLASTIK

### Products (6):
Barang Jadi, Bahan Baku, Bahan Kemasan, Bahan Penolong, Barang Dalam Proses, Lainnya

### Locations (2):
Gudang Utama (gudang-utama), Gudang Barat (gudang-barat)

---

## 9. File References

| File | Path |
|------|------|
| Reconciling Notes | `docs/data-import/melindo-initial/2026-06-12-reconciling-notes.md` |
| Restart Checklist | `docs/data-import/melindo-initial/2026-06-10-melindo-opening-balance-restart-checklist.md` |
| AP Import Script | `scripts/seed-ap-opening-balance.ts` |
| AR Import Script | `scripts/seed-ar-opening-balance.ts` |
| AP CSV Source | `docs/data-import/melindo-initial/ap-opening-detail-from-sheets.csv` |
| AR CSV Source | `docs/data-import/melindo-initial/ar-opening-detail-from-sheets.csv` |
| Staging Summary | `docs/data-import/melindo-initial/melindo-opening-balance-final-staging-summary.json` |
| Final Staging CSV | `docs/data-import/melindo-initial/melindo-opening-balance-final-staging.csv` |
| Execution Pack | `docs/data-import/melindo-initial/melindo-opening-balance-final-execution-pack.md` |

---

## 10. Yang Masih Perlu Dikerjakan

1. **Update NR_opening** — update 11 cell di kolom B sesuai tabel di section 5
2. **LR_Opening** — Laporan Laba Rugi belum diimport (ada di tab LR_Opening, belum ada workflow import)
3. **Closing entries** — Opening Balance Equity (30000) perlu di-close ke Laba Ditahan (32000) saat periode akuntansi ditutup

---

## 11. Keputusan Penting yang Sudah Dibuat

1. **2 lokasi gudang** — Gudang Utama dan Gudang Barat, bukan 1 gabungan
2. **AP: SB Plast dihapus** — invoice SBP001/04/2026 sudah tidak ada di sheets, dihapus dari DB
3. **Inventory: Pewarna Putih koreksi harga** — kelebihan 100x lipat (2,600,000 → 26,000)
4. **FA: Mesin Extruder A dihapus** — sudah tidak ada di sheets
5. **FA: Gudang Bahan ditambahkan** — baru ada di sheets
6. **Owner liability 2-390** — confirmed sebagai hutang pemilik, diposting terpisah
7. **CIP (1-121)** — diposting ke akun 11700, bukan ke 1-199

---

## 12. Pitfalls & Catatan Teknis

- **Entry number generation**: pakai format `JE - 2026 -XXXXX` dengan sequence di tabel `SystemSequence`
- **PurchaseInvoice butuh PurchaseOrder**: setiap AP opening buat placeholder PO (`PO-OPEN-{invoiceNumber}`)
- **AR opening butuh SalesOrder**: setiap AR opening buat placeholder SO (`SO-OPEN-{invoiceNumber}`)
- **Inventory**: Product → ProductVariant → Inventory (per location) + StockMovement (ADJUSTMENT type)
- **FixedAsset**: butuh 3 account references (asset, depreciation expense, accumulated depreciation)
- **CSV parsing**: angka di Google Sheets pakai koma sebagai thousand separator, perlu handle dengan benar
- **Prisma timeout**: transaksi besar perlu timeout minimal 15000ms
- **Double-quote PascalCase**: semua nama tabel PostgreSQL pakai PascalCase, wajib double-quote di SQL
