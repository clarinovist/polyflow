# 🛒 UAT — Modul Pembelian & Pengadaan

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Purchase Order, Goods Receipt, Purchase Invoice, MRP |
| **Halaman** | `/planning/purchase-orders`, `/warehouse/incoming`, `/planning/mrp` |
| **Login Sebagai** | ADMIN atau PROCUREMENT/PPIC |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Sudah ada Supplier minimal 2
- Sudah ada produk RAW_MATERIAL
- Supplier sudah terhubung ke produk (SupplierProduct)

---

## A. Purchase Order (PO)

### TC-PO-001: Buat PO Baru
| **ID** | TC-PO-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. `/planning/purchase-orders` → Buat PO
2. Pilih Supplier, tanggal, lokasi tujuan (gudang penerima)
3. Tambah item: produk, qty, harga satuan, pajak %
4. Simpan

**Diharapkan:** PO tersimpan, nomor auto-generate, status DRAFT, total benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PO-002: Konfirmasi PO
| **ID** | TC-PO-002 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** PO DRAFT → klik Konfirmasi

**Diharapkan:** Status → CONFIRMED, PO siap diterima barangnya di gudang

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PO-003: Complete PO
| **ID** | TC-PO-003 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Setelah semua barang diterima (GR sudah lengkap) → Complete PO

**Diharapkan:** Status → COMPLETED, receivedQty = orderedQty

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PO-004: Cancel PO
| **ID** | TC-PO-004 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** PO DRAFT atau CONFIRMED → Cancel

**Diharapkan:** Status → CANCELLED, PO yang sudah ada receiptnya tidak boleh di-cancel

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## B. Goods Receipt (Penerimaan Barang)

### TC-GR-001: Terima Barang dari PO
| **ID** | TC-GR-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

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
| **ID** | TC-GR-002 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** PO item 1000 KG → terima 600 KG dulu → nanti terima 400 KG

**Diharapkan:** 2 receipt tercatat, total received = 1000, stok total +1000 KG

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-GR-003: Terima Melebihi PO (Over-Receipt)
| **ID** | TC-GR-003 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** PO item 1000 KG → coba terima 1100 KG

**Diharapkan:** Sesuai kebijakan — bisa ditolak ATAU diizinkan dengan peringatan

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-GR-004: Update Harga Standard (Weighted Average)
| **ID** | TC-GR-004 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Catat harga standar produk saat ini (contoh: Rp 14.000/KG)
2. Buat PO dengan harga baru (Rp 16.000/KG)
3. Terima barang → periksa harga standar produk
4. Buka Cost History di detail produk

**Diharapkan:** Harga standar terupdate (weighted average), perubahan tercatat di Cost History

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## C. Purchase Invoice

### TC-PI-001: Buat Purchase Invoice
| **ID** | TC-PI-001 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Buat invoice pembelian dari PO → Simpan

**Diharapkan:** Invoice tersimpan, status UNPAID, total sesuai PO

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PI-002: Bayar Purchase Invoice
| **ID** | TC-PI-002 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Buka PI → Catat Pembayaran → Simpan

**Diharapkan:** Status → PAID jika lunas, jurnal otomatis (debit hutang, kredit kas)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## D. MRP (Material Requirements Planning)

### TC-MRP-001: Jalankan MRP
| **ID** | TC-MRP-001 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:**
1. `/planning/mrp` → Jalankan MRP
2. Pilih periode, rentang tanggal
3. Klik Jalankan

**Diharapkan:** Sistem menghitung kebutuhan bahan baku berdasarkan Production Order + stok tersedia, menghasilkan rekomendasi PO

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-MRP-002: Buat PO dari Rekomendasi MRP
| **ID** | TC-MRP-002 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Dari hasil MRP → pilih rekomendasi → klik Buat PO

**Diharapkan:** PO otomatis dibuat dengan qty dan supplier dari rekomendasi MRP

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Bagian | TC | Lulus | Gagal | Sebagian |
|--------|-----|-------|-------|----------|
| Purchase Order | 4 | | | |
| Goods Receipt | 4 | | | |
| Purchase Invoice | 2 | | | |
| MRP | 2 | | | |
| **TOTAL** | **12** | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
