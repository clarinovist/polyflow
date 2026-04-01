# 🔗 UAT — Integrasi Antar Modul (Cross-Module)

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Pengujian alur end-to-end yang melintasi beberapa modul sekaligus |
| **Halaman** | Seluruh modul |
| **Login Sebagai** | ADMIN (untuk akses penuh) |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Semua modul individual sudah diuji (file 01-11)
- Data master (produk, BOM, customer, supplier) sudah lengkap
- Stok bahan baku tersedia

---

## A. Alur Penjualan End-to-End (Order to Cash)

### TC-CROSS-001: Quotation → Sales Order → Delivery → Invoice → Payment
| **ID** | TC-CROSS-001 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Buat **Quotation** untuk Customer → Kirim → Accept
2. Periksa **Sales Order** otomatis terbentuk → Konfirmasi
3. Buat **Delivery Order** dari SO → kirim semua qty
4. Periksa **stok berkurang** di gudang
5. Buat **Invoice** dari SO → periksa total
6. Catat **Pembayaran** penuh → periksa status PAID
7. Buka **Jurnal** → periksa jurnal otomatis

**Diharapkan:**
- Setiap langkah menghasilkan dokumen yang saling terhubung (linked)
- Stok berkurang saat delivery
- Invoice amount = SO amount
- Jurnal otomatis: Debit Kas, Kredit Piutang
- Status akhir: Quotation ACCEPTED, SO COMPLETED, Invoice PAID

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-CROSS-002: Make-to-Order → Produksi → Delivery
| **ID** | TC-CROSS-002 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Buat SO tipe **MAKE_TO_ORDER** → Konfirmasi
2. Periksa **Production Order** otomatis terbentuk
3. Release PO → Start Job → Log Output → Complete
4. Periksa stok barang jadi bertambah
5. Buat **Delivery Order** dari SO
6. Periksa stok berkurang

**Diharapkan:**
- SO MAKE_TO_ORDER → otomatis buat Production Order
- Produksi selesai → stok + di FG
- Delivery → stok - di FG
- Semua dokumen saling terhubung

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## B. Alur Pembelian End-to-End (Procure to Pay)

### TC-CROSS-003: PO → Goods Receipt → Purchase Invoice → Payment
| **ID** | TC-CROSS-003 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Buat **Purchase Order** → Konfirmasi
2. Terima barang (**Goods Receipt**) → periksa stok bertambah
3. Periksa **harga standar** produk terupdate (weighted average)
4. Buat **Purchase Invoice** → periksa total
5. Catat **Pembayaran** → periksa jurnal otomatis

**Diharapkan:**
- Stok bertambah saat GR
- Harga standar terupdate
- Jurnal otomatis: Debit Hutang, Kredit Kas
- Status PO → COMPLETED, Invoice → PAID

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## C. Alur Produksi End-to-End

### TC-CROSS-004: Material Issue → Produksi → Backflush → Output → Scrap
| **ID** | TC-CROSS-004 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Catat **semua stok** terkait SEBELUM produksi dimulai:
   - Stok bahan baku di lokasi sumber (Mixing Area/RM Warehouse)
   - Stok barang jadi di FG Warehouse
   - Stok scrap di Scrap Warehouse
2. Buat Production Order → Release → Start
3. Log Output: good 480 KG, prongkol 10 KG, daun 10 KG
4. Periksa **semua stok** SESUDAH:
   - Bahan baku berkurang (backflush: 500 × rasio BOM)
   - Barang jadi +480 di FG
   - Scrap Prongkol +10, Scrap Daun +10 di Scrap Warehouse

**Diharapkan:**
- **Total input** = total output (good + scrap) = 500
- **Backflush** mengurangi setiap bahan sesuai proporsi BOM
- **Movement History** mencatat semua pergerakan (PRODUCTION_IN, PRODUCTION_OUT)
- Tidak ada stok yang menjadi negatif

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-CROSS-005: Lokasi Sumber Backflush Sesuai Kategori BOM
| **ID** | TC-CROSS-005 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Buat order dengan BOM kategori **EXTRUSION** → log output → cek lokasi pengurangan
2. Buat order dengan BOM kategori **PACKING** → log output → cek lokasi pengurangan

**Diharapkan:**
- EXTRUSION → bahan diambil dari **Mixing Area**
- PACKING → bahan diambil dari **Finished Goods / Finishing Area**
- STANDARD → sesuai default lokasi

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## D. Alur MRP End-to-End

### TC-CROSS-006: SO → MRP → PO Otomatis → GR → Produksi
| **ID** | TC-CROSS-006 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Buat SO yang membutuhkan bahan baku melebihi stok saat ini
2. Jalankan **MRP** → lihat rekomendasi
3. Buat PO dari rekomendasi MRP
4. Terima barang (GR)
5. Stok bahan baku mencukupi → mulai produksi

**Diharapkan:** Alur berjalan tanpa hambatan, MRP menghitung kebutuhan dengan benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## E. Konsistensi Data

### TC-CROSS-007: Total Stok = Sum Semua Lokasi
| **ID** | TC-CROSS-007 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Pilih 1 produk
2. Catat stok di setiap lokasi (RM, Mixing, Extrusion, FG, Scrap)
3. Jumlahkan semua
4. Bandingkan dengan total di dashboard

**Diharapkan:** Total stok di dashboard = jumlah stok di semua lokasi

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-CROSS-008: Movement History Lengkap
| **ID** | TC-CROSS-008 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Setelah menjalankan TC-CROSS-001 sampai TC-CROSS-004
2. Buka Movement History
3. Periksa apakah SEMUA pergerakan tercatat

**Diharapkan:** Setiap transfer, GR, delivery, backflush, adjustment tercatat lengkap dengan timestamp, user, reference

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-CROSS-009: Trial Balance Seimbang Setelah Transaksi
| **ID** | TC-CROSS-009 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:** Setelah menjalankan alur penjualan & pembelian → buka Trial Balance

**Diharapkan:** Total Debit = Total Kredit (seimbang), semua jurnal otomatis terhitung

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-CROSS-010: FIFO Material — Batch Lama Dipakai Duluan
| **ID** | TC-CROSS-010 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Terima 2 batch bahan baku berbeda waktu (batch A dulu, lalu batch B)
2. Lakukan produksi yang membutuhkan bahan tsb
3. Periksa batch mana yang dipakai

**Diharapkan:** Batch A (yang lebih dulu masuk) dipakai terlebih dahulu (prinsip FIFO)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-CROSS-011: Auto-Numbering Konsisten di Semua Modul
| **ID** | TC-CROSS-011 | **Prioritas** | 🟢 P3 |
|--------|-------------|---------------|--------|

**Langkah:** Periksa format auto-numbering di: SO, PO, DO, Invoice, Production Order, Opname

**Diharapkan:** Setiap modul punya format unik, nomor urut tidak ada yang skip/duplikat

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Bagian | TC | Lulus | Gagal | Sebagian |
|--------|-----|-------|-------|----------|
| Order to Cash | 2 | | | |
| Procure to Pay | 1 | | | |
| Produksi E2E | 2 | | | |
| MRP E2E | 1 | | | |
| Konsistensi Data | 5 | | | |
| **TOTAL** | **11** | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
