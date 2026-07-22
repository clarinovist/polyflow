# UAT — Modul Pembelian & Pengadaan

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Purchase Request, Purchase Order, Goods Receipt, Purchase Invoice, Retur |
| **Halaman** | `/purchasing`, `/purchasing/requests`, `/purchasing/orders`, `/purchasing/returns`, `/warehouse/incoming`, `/finance/invoices/purchase` |
| **Login Sebagai** | ADMIN atau PROCUREMENT/PPIC |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Sudah ada Supplier minimal 2
- Sudah ada produk RAW_MATERIAL
- Supplier sudah terhubung ke produk (SupplierProduct)

---

## A. Papan Pembelian (Command Board)

### TC-PUR-HOME-001: Board 5 kartu + attention
| **ID** | TC-PUR-HOME-001 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:**
1. Buka `/purchasing`
2. Periksa 5 kartu statistik: PR proses, DRAFT PO, Tunggu terima, Partial sisa, AP overdue

**Diharapkan:**
- 5 kartu tampil dengan angka benar sesuai data
- Kartu AP overdue menampilkan jumlah + nominal
- Section "Butuh Perhatian" menampilkan list PR/PO/AP yang butuh tindakan

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PUR-HOME-002: Deep link status filters
| **ID** | TC-PUR-HOME-002 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:**
1. Klik kartu "DRAFT PO" → pastikan navigasi ke `/purchasing/orders?status=DRAFT`
2. Klik kartu "Tunggu terima" → pastikan navigasi ke `/purchasing/orders?status=SENT`
3. Klik kartu "Partial sisa" → pastikan navigasi ke `/purchasing/orders?status=PARTIAL_RECEIVED`
4. Klik kartu "PR proses" → pastikan navigasi ke `/purchasing/requests`
5. Klik kartu "AP overdue" → pastikan navigasi ke `/finance/invoices/purchase`

**Diharapkan:** Setiap kartu mengarahkan ke halaman yang sesuai dengan filter yang benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PUR-HOME-003: Partial PO muncul di attention
| **ID** | TC-PUR-HOME-003 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:**
1. Buat PO, terima sebagian barang (partial)
2. Buka `/purchasing`

**Diharapkan:** PO partial muncul di section "PO partial — sisa qty" dengan link ke detail PO

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PUR-XWH-001: Link gudang incoming dari copy
| **ID** | TC-PUR-XWH-001 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:**
1. Buka `/purchasing`
2. Periksa catatan cross-module "Terima barang di Portal Gudang → Penerimaan"

**Diharapkan:** Link mengarah ke `/warehouse/incoming`

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PUR-XFIN-001: Overdue AP → finance
| **ID** | TC-PUR-XFIN-001 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:**
1. Buka `/purchasing`
2. Periksa section "Hutang jatuh tempo" di attention
3. Klik link "Bayar hutang di Finance → Hutang"

**Diharapkan:** Link mengarah ke `/finance/invoices/purchase`

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## B. Purchase Order (PO)

### TC-PO-001: Buat PO Baru
| **ID** | TC-PO-001 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:**
1. `/purchasing/orders` → Buat PO
2. Pilih Supplier, tanggal, lokasi tujuan (gudang penerima)
3. Tambah item: produk, qty, harga satuan, pajak %
4. Simpan

**Diharapkan:** PO tersimpan, nomor auto-generate, status DRAFT, total benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PO-002: Konfirmasi PO
| **ID** | TC-PO-002 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:** PO DRAFT → klik Konfirmasi

**Diharapkan:** Status → CONFIRMED, PO siap diterima barangnya di gudang

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PO-003: Complete PO
| **ID** | TC-PO-003 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:** Setelah semua barang diterima (GR sudah lengkap) → Complete PO

**Diharapkan:** Status → COMPLETED, receivedQty = orderedQty

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PO-004: Cancel PO
| **ID** | TC-PO-004 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:** PO DRAFT atau CONFIRMED → Cancel

**Diharapkan:** Status → CANCELLED, PO yang sudah ada receiptnya tidak boleh di-cancel

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## C. Goods Receipt (Penerimaan Barang)

### TC-GR-001: Terima Barang dari PO
| **ID** | TC-GR-001 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:**
1. `/warehouse/incoming` → Buat Penerimaan
2. Pilih PO yang sudah CONFIRMED
3. Masukkan qty diterima per item
4. Simpan

**Diharapkan:**
- Stok produk bertambah di lokasi tujuan PO
- receivedQty di PO terupdate
- Record PURCHASE muncul di Movement History
- Harga standar produk terupdate (weighted average)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-GR-002: Partial Receipt (Terima Sebagian)
| **ID** | TC-GR-002 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:** PO item 1000 KG → terima 600 KG dulu → nanti terima 400 KG

**Diharapkan:** 2 receipt tercatat, total received = 1000, stok total +1000 KG

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-GR-003: Terima Melebihi PO (Over-Receipt)
| **ID** | TC-GR-003 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:** PO item 1000 KG → coba terima 1100 KG

**Diharapkan:** Sesuai kebijakan — bisa ditolak ATAU diizinkan dengan peringatan

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-GR-004: Update Harga Standard (Weighted Average)
| **ID** | TC-GR-004 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:**
1. Catat harga standar produk saat ini (contoh: Rp 14.000/KG)
2. Buat PO dengan harga baru (Rp 16.000/KG)
3. Terima barang → periksa harga standar produk
4. Buka Cost History di detail produk

**Diharapkan:** Harga standar terupdate (weighted average), perubahan tercatat di Cost History

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## D. Purchase Invoice

### TC-PI-001: Buat Purchase Invoice
| **ID** | TC-PI-001 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:** Buat invoice pembelian dari PO → Simpan

**Diharapkan:** Invoice tersimpan, status UNPAID, total sesuai PO

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PI-002: Bayar Purchase Invoice
| **ID** | TC-PI-002 | **Prioritas** | P2 |
|--------|-----------|---------------|-----|

**Langkah:** Buka PI → Catat Pembayaran → Simpan

**Diharapkan:** Status → PAID jika lunas, jurnal otomatis (debit hutang, kredit kas)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## E. Sidebar & Navigasi

### TC-PUR-NAV-001: Sidebar label Indonesia
| **ID** | TC-PUR-NAV-001 | **Prioritas** | P1 |
|--------|-----------|---------------|-----|

**Langkah:**
1. Buka portal Pembelian
2. Periksa sidebar

**Diharapkan:**
- Group "Hari Ini" → Papan Pembelian
- Group "Transaksi" → Permintaan (PR), Order Pembelian (PO), Retur
- Group "Master" → Supplier
- Group "Maklon" → Monitor Penerimaan Maklon
- Group "Laporan" → Analitik Pembelian
- Portal name: "Portal Pembelian"

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Bagian | TC | Lulus | Gagal | Sebagian |
|--------|-----|-------|-------|----------|
| Papan Pembelian | 5 | | | |
| Purchase Order | 4 | | | |
| Goods Receipt | 4 | | | |
| Purchase Invoice | 2 | | | |
| Sidebar & Navigasi | 1 | | | |
| **TOTAL** | **16** | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
