# UAT — Portal Gudang (Warehouse Portal)

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Portal Warehouse — Command Board, Incoming, Outgoing, Bahan Produksi, Inventori |
| **Halaman** | `/warehouse`, `/warehouse/incoming`, `/warehouse/outgoing`, `/warehouse/materials`, `/warehouse/inventory`, `/warehouse/analytics` |
| **Login Sebagai** | WAREHOUSE |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Login sebagai user role WAREHOUSE
- Sudah ada PO SENT/PARTIAL (untuk incoming)
- Sudah ada DO PENDING/LOADING (untuk outgoing)
- Sudah ada SPK RELEASED/IN_PROGRESS (untuk bahan produksi)

---

### TC-WH-001: Home = Shift Command Board
| **ID** | TC-WH-001 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:** Login sebagai WAREHOUSE -> otomatis redirect ke `/warehouse`

**Diharapkan:**
- Halaman menampilkan 5 kartu: Terima, Muat, Bahan Produksi, Stok Menipis, Perlu Reorder
- Setiap kartu menampilkan angka count dan link CTA
- Bagian "Butuh Perhatian" menampilkan top 5 SJ loading belum verifikasi, PO partial, SPK waiting material
- Bagian "Aktivitas Hari Ini" menampilkan GR, SJ dikirim, issue bahan
- Sidebar menampilkan: Hari Ini, Penerimaan, Antrian Muat, Bahan Produksi, Stock Opname

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-001b: Kartu Navigasi Command Board
| **ID** | TC-WH-001b | **Prioritas** | P1 |
|--------|------------|---------------|-----|

**Langkah:** Klik setiap kartu di command board

**Diharapkan:**
- Kartu "Terima" -> `/warehouse/incoming`
- Kartu "Muat" -> `/warehouse/outgoing`
- Kartu "Bahan Produksi" -> `/warehouse/materials`
- Kartu "Stok Menipis" -> `/warehouse/inventory?lowStock=true`
- Kartu "Perlu Reorder" -> `/warehouse/analytics#reorder`

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-001c: Bahan Produksi (ex home queue)
| **ID** | TC-WH-001c | **Prioritas** | P1 |
|--------|------------|---------------|-----|

**Langkah:**
1. Login WAREHOUSE -> `/warehouse/materials`
2. Verifikasi queue SPK muncul (filter RM/WIP, auto-refresh 30s)
3. Klik tombol "Gabungkan Pengambilan" -> ConsolidatedIssueDialog terbuka

**Diharapkan:**
- Queue SPK berfungsi sama seperti home lama
- Filter RM/WIP berfungsi
- Auto-refresh 30 detik aktif
- Breadcrumb: Gudang -> Bahan Produksi

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-002: Penerimaan Barang dari PO
| **ID** | TC-WH-002 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:**
1. `/warehouse/incoming` -> lihat antrean **Menunggu Diterima** (PO SENT / PARTIAL)
2. Klik **Terima** pada PO -> input qty diterima -> Simpan
3. (Opsional) buka **Riwayat** di `/warehouse/incoming/history`

**Diharapkan:** Stok bertambah di lokasi gudang, receipt tercatat, PO receivedQty terupdate, GR muncul di "Diterima Hari Ini"

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-002b: Terima dari Nota (tanpa PO)
| **ID** | TC-WH-002b | **Prioritas** | P1 |
|--------|------------|---------------|-----|

**Langkah:**
1. `/warehouse/incoming` -> **Terima dari Nota**
2. Isi supplier, no. nota/SJ, lokasi, item + qty -> Simpan

**Diharapkan:** PO otomatis terbentuk (notes `[WAREHOUSE_WALK_IN]`), GR tercatat, stok naik, finance mendapat notifikasi

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-003: Proses Pengiriman (Outgoing / Antrian Muat)
| **ID** | TC-WH-003 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:**
1. Login WAREHOUSE -> `/warehouse/outgoing` (Antrian Muat = list SJ PENDING/LOADING)
2. Pilih Surat Jalan -> detail DO di path warehouse
3. **Mulai Muat** (PENDING -> LOADING)
4. Panel **Verifikasi Muat**: isi qty fisik -> **Kunci Verifikasi**
5. **Tandai Dikirim** (butuh verifikasi terkunci + stok FG cukup)

**Diharapkan:** Stok berkurang, DO -> SHIPPED, SO deliveredQty terupdate, invoice DRAFT

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-004: Navigasi Inventori per Lokasi
| **ID** | TC-WH-004 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:** `/warehouse/inventory` -> klik tab lokasi berbeda

**Diharapkan:** Stok tampil per lokasi, bisa switch antar lokasi dengan klik tab

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-005: Transfer Stok dari Portal
| **ID** | TC-WH-005 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:** Dari inventori -> Transfer -> pilih asal & tujuan -> qty -> Transfer

**Diharapkan:** Transfer berhasil, stok berpindah, movement history tercatat

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-006: Stok Opname dari Portal
| **ID** | TC-WH-006 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:** `/warehouse/opname` -> buat opname -> input hitung -> selesaikan

**Diharapkan:** Proses opname berjalan sama seperti dari akses ADMIN

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-007: Isolasi Akses
| **ID** | TC-WH-007 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:** Coba akses `/dashboard`, `/production`, `/finance`, `/sales` manual via address bar

**Diharapkan:** Semua dialihkan kembali ke `/warehouse`

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-008: Stok Terupdate Real-Time
| **ID** | TC-WH-008 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:** Buka inventori -> dari tab/window lain lakukan transfer -> refresh

**Diharapkan:** Stok terupdate setelah refresh

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-009: Analytics Reorder List
| **ID** | TC-WH-009 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:**
1. `/warehouse/analytics` -> scroll ke bagian "Perlu Reorder"
2. Verifikasi item muncul di bawah reorder point
3. Klik link product -> product 360 terbuka

**Diharapkan:** List reorder muncul dengan data yang benar, deep link ke product berfungsi

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-010: Inventory Quick Actions
| **ID** | TC-WH-010 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:**
1. `/warehouse/inventory` -> verifikasi quick actions toolbar
2. Klik Transfer, Penyesuaian, Aging, Mutasi, Opname

**Diharapkan:** Semua path valid (tidak 404):
- Transfer -> `/warehouse/inventory/transfer`
- Penyesuaian -> `/warehouse/inventory/adjustment`
- Aging -> `/warehouse/inventory/aging`
- Mutasi -> `/warehouse/inventory/history`
- Opname -> `/warehouse/opname`

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

### TC-WH-011: No Broken Links
| **ID** | TC-WH-011 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:** Klik semua link di sidebar, command board, inventory toolbar, analytics

**Diharapkan:** Tidak ada link yang mengarah ke 404

**Hasil:** Lulus / Gagal / Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Total TC | Lulus | Gagal | Sebagian |
|----------|-------|-------|----------|
| 11 | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
