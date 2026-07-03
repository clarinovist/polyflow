# Catatan & Issues — Melindo Opening Balance Rebuild
Tanggal: 14 Juni 2026

## Yang Sudah Selesai Hari Ini

### 1. Journal Opening Balance (OB-MEL-2026-0002)
- Status: POSTED
- 27 lines, balanced (debit = credit = Rp 4,584,202,687.69)
- Menggunakan NR_opening sebagai source of truth
- Jurnal lama (OB-MEL-2026-0001) sudah di-reverse

### 2. AR Opening (11 invoices)
- 11 SalesOrders + 11 Invoices (UNPAID)
- Total: Rp 192,527,366
- Semua customer matched ke DB

### 3. AP Opening (106 tagihan)
- 106 PurchaseOrders + 106 PurchaseInvoices (UNPAID)
- Total: Rp 1,604,281,151
- 8 supplier unik, semua matched ke DB

### 4. Fixed Asset (89 aset)
- 89 FixedAsset rows terdaftar
- Total Purchase Value: Rp 2,722,284,889
- Acc Depr (distribusi proporsional dari NR_opening): Rp 1,102,506,466
- NBV: Rp 1,619,778,423

### 5. Inventory Seed (161 item)
- 161 Inventory records terbuat
- 2 lokasi: Gudang Utama + Gudang Barat (baru dibuat)
- Total value: Rp 733,313,128
- averageCost sudah di-set dari harga_satuan sheet

### 6. Account 3-201b (Laba Tahun Berjalan)
- Akun baru dibuat karena tidak ada di COA Melindo

---

## Issues yang Perlu Diselesaikan

### ISSUE-001: 31 Item Inventory Tidak Match
**Severity: MEDIUM**
**Status: OPEN**

31 item dari Inventory_opening sheet tidak bisa di-match ke ProductVariant di DB:

**Kategori: Tanpa SKU (15 item)**
Perlu matching manual by name atau buat SKU baru:
- PP Biru (Bahan Baku, Rp 9.2M)
- PP Hijau (Bahan Baku, Rp 2.8M)
- PP Hijau SMP (Bahan Baku, Rp 30.2M)
- PP Hitam Sablon (Bahan Baku, Rp 3.3M)
- PP Kuning (Bahan Baku, Rp 7.2M)
- PP Merah x2 (Bahan Baku, Rp 14.1M)
- PP OPP (Bahan Baku, Rp 5.6M)
- PP Toko (Bahan Baku, Rp 17.3M)
- Pewarna Putih (Bahan Baku, Rp 7.8M)
- Etiket Jangkar (Bahan Kemasan, Rp 1.0M)
- Etiket Grace (Bahan Kemasan, Rp 0.6M)
- Spidol Putih Snowman (Bahan Penolong, Rp 0.1M)
- Isolasi Listrik (Bahan Penolong, Rp 0.03M)
- Persediaan WIP (Barang Dalam Proses, Rp 26.5M)

**Kategori: SKU Ada di Sheet tapi Tidak Ada di DB (10 Barang Jadi)**
SKU mismatch — mungkin produk belum di-import atau SKU berbeda:
- SBP00WL55 Sedotan Bening Lancip Lubang 5.5 (Rp 3.5M)
- SBLMDST06 Sedotan Bening Lurik Merah Putih Tumpul (Rp 0.4M)
- SRP00KT06 Sedotan Biru KW (Rp 2.1M)
- SRLD0ST06 Sedotan Biru Lurik Dop Lubang 6 (Rp 1.8M)
- SRP00ST85 Sedotan Biru Tumpul Lubang 8.5 (Rp 1.9M)
- SDP00KT06 Sedotan Dop KW (Rp 0.8M)
- SJP00KT06 Sedotan Hijau KW (Rp 0.7M)
- SJP00KL55 Sedotan Hijau Lancip Lubang 5.5 (Rp 0.9M)
- SHP00KL50 Sedotan Hitam Lancip (Rp 2.0M)
- SHP00KT95 Sedotan Hitam Tumpul Lubang 9,5 (Rp 0.2M)

**Kategori: Tanpa SKU + Barang Jadi (1 item)**
- Sedotan Warna Pop Ice Tumpul 130gr (Rp 4.0M)

**Kategori: Tanpa SKU + Lainnya (5 item)**
- Buku Tulis (Rp 29K)
- Spidol Kecil Hitam (Rp 6K)
- Spidol Kecil Merah (Rp 6K)
- Stabilo (Rp 29K)
- Isolasi/Lakban Hitam 2" (Rp 76K)

**Total unmatched value: Rp 144,248,398**

**Action needed:**
1. Buat product variant baru untuk item tanpa SKU (terutama PP Biru, PP Hijau, dll)
2. Match SKU Barang Jadi yang tidak ketemu (mungkin perlu update SKU di DB atau buat variant baru)
3. Setelah matched, seed Inventory records untuk 31 item ini

---

### ISSUE-002: Acc Depr Sheet vs NR_opening Mismatch
**Severity: LOW (sudah di-handle)**
**Status: RESOLVED (workaround)**

Data accumulated depreciation di FixedAsset_opening sheet berbeda Rp 1.07M dari NR_opening:
- Sheet individual total acc depr: Rp 2,177,448,268
- NR_opening total acc depr: Rp 1,102,506,466
- Delta: Rp 1,074,941,802

Beberapa aset memiliki acc depr > purchase value:
- Kompresor SHARK: Purchase 3.7M, AccDepr di sheet 327.6M (jelas salah)
- Mesin Gulung Tali Etek: Purchase 8M, AccDepr di sheet 675M (jelas salah)

**Workaround yang sudah diterapkan:**
Distribusi proporsional acc depr dari NR_opening per kategori, bukan pakai data sheet individual.

**Action needed:**
1. Minta admin verifikasi data acc depr individual yang benar
2. Update FixedAsset rows dengan acc depr yang benar per aset

---

### ISSUE-003: Mapping Akun 1-125 Ambigu
**Severity: LOW**
**Status: OPEN**

Di DB Melindo:
- 1-125 = "Sewa Dibayar Dimuka"

Di NR_opening sheet:
- 1-123 = "Sewa Dibayar Dimuka" (Rp 51.5M)
- 1-125 = "Persediaan Bahan Penolong" (Rp 3.7M)

Di jurnal posting:
- 1-123 → DB 1-125 (Sewa Dibayar Dimuka): Rp 51.5M ✓
- 1-125 → DB 1-127 (Persediaan Bahan Penolong): Rp 3.7M ✓ (akun 1-127 ada di DB)

**Action needed:**
1. Tidak urgent karena sudah di-map dengan benar di jurnal
2. Catatan untuk admin: kode akun di sheet dan DB tidak 1:1

---

### ISSUE-004: Bridge 1-199 Balance
**Severity: MEDIUM**
**Status: OPEN (expected)**

Bridge 1-199 saat ini:
- Debit: Rp 192,527,366 (AR placeholder)
- Credit: Rp 1,604,281,151 (AP placeholder)
- Net: Rp -1,411,753,785 (credit balance)

**Mekanisme settlement:**
- Saat customer bayar AR → Payment module auto-debit 1-199, credit AR
- Saat Melindo bayar AP → Payment module auto-debit AP, credit 1-199
- Setelah semua AR+AP lunas → 1-199 = 0

**Action needed:**
1. Monitor bridge balance seiring pembayaran AR/AP
2. Pastikan tidak ada posting manual yang ganggu bridge

---

### ISSUE-005: Double-Count Risk Inventory GL
**Severity: HIGH**
**Status: OPEN (needs decision)**

Jurnal opening balance sudah post inventory values langsung ke GL accounts:
- 1-130 Bahan Baku: Rp 415,987,052
- 1-131 Bahan Kemasan: Rp 118,213,686
- 1-132 Barang Dalam Proses: Rp 26,546,600
- 1-126 Persediaan Barang Jadi: Rp 308,169,441
- 1-134 Alat Tulis: Rp 4,994,323

Jika stock opname dijalankan dan auto-generate journal entries, inventory akan tercatat DOBEL.

**Opsi penyelesaian:**
A. Jangan jalankan stock opname, cukup seed Inventory records (sudah dilakukan)
B. Jalankan stock opname, lalu reverse inventory lines dari opening journal
C. Jalankan stock opname dengan cost=0 supaya tidak auto-generate journal

**Rekomendasi:** Opsi A — Inventory records sudah ter-seed dengan qty dan averageCost. GL sudah benar. UI akan menunjukkan data yang benar. Stock opname bisa dijalankan nanti untuk adjustment aktual.

---

### ISSUE-006: FixedAsset Depreciation Schedule
**Severity: LOW**
**Status: OPEN**

FixedAsset sudah terdaftar tapi depreciation schedule belum dijalankan. 
lastDepreciationDate diset ke 2026-05-31 untuk semua aset.

**Action needed:**
1. Jalankan depreciation batch untuk periode Juni 2026 dan seterusnya
2. Atau set lastDepreciationDate ke None supaya batch pertama jalan dari awal

---

### ISSUE-007: Gudang Barat Location
**Severity: LOW**
**Status: RESOLVED**

Lokasi "Gudang Barat" sudah dibuat untuk Bahan Baku items.
ID: bbbbbbbb-0000-4000-8000-000000000001

---

## Ringkasan Status

| Komponen | Status | Catatan |
|----------|--------|---------|
| Journal OB | ✅ DONE | OB-MEL-2026-0002, POSTED |
| AR Opening | ✅ DONE | 11 invoices, UNPAID |
| AP Opening | ✅ DONE | 106 invoices, UNPAID |
| Fixed Asset | ✅ DONE | 89 aset, acc depr perlu verifikasi |
| Inventory Seed | ⚠️ PARTIAL | 161/192 matched, 31 pending |
| Bridge 1-199 | ⏳ ACTIVE | Net -1.4B, settlement by AR/AP payments |
| Account COA | ✅ DONE | 3-201b baru dibuat |

## Next Steps (Priority Order)
1. Resolve ISSUE-001: Buat product variant untuk 31 unmatched items
2. Resolve ISSUE-005: Konfirmasi approach inventory (Opsi A recommended)
3. Verify di UI: buka melindo.polyflow.uk dan cek balance sheet
4. Monitor bridge 1-199 seiring transaksi berjalan
5. Verifikasi acc depr individual (ISSUE-002) dengan admin
