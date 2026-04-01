# 💰 UAT — Modul Penjualan & Distribusi

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Quotation, Sales Order, Delivery Order, Invoice, Payment, Returns |
| **Halaman** | `/sales/quotations`, `/sales/orders`, `/sales/deliveries`, `/sales/invoices`, `/sales/returns` |
| **Login Sebagai** | ADMIN atau SALES |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Sudah ada data Customer minimal 2
- Sudah ada produk Finished Good dengan stok
- Login sebagai ADMIN atau SALES

---

## A. Sales Quotation (Penawaran)

### TC-SQ-001: Buat Quotation Baru
| **ID** | TC-SQ-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. `/sales/quotations` → Buat Quotation
2. Pilih Customer, tanggal, masa berlaku
3. Tambah item: produk, qty, harga satuan, diskon %, pajak %
4. Simpan

**Diharapkan:** Quotation tersimpan, nomor auto-generate, status DRAFT, subtotal/diskon/pajak terhitung benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SQ-002: Kirim Quotation
| **ID** | TC-SQ-002 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Buka quotation DRAFT → klik Kirim/Send

**Diharapkan:** Status → SENT, quotation tidak bisa diedit lagi kecuali di-revisi

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SQ-003: Terima Quotation → Buat Sales Order
| **ID** | TC-SQ-003 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Quotation SENT → klik Accept/Terima → otomatis buat Sales Order

**Diharapkan:** Status quotation → ACCEPTED, Sales Order otomatis dibuat dengan data dari quotation, link antara SO dan Quotation terlihat

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SQ-004: Tolak Quotation
| **ID** | TC-SQ-004 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Quotation SENT → klik Tolak/Reject

**Diharapkan:** Status → REJECTED, tidak ada Sales Order yang dibuat

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## B. Sales Order (Pesanan)

### TC-SO-001: Buat Sales Order Manual
| **ID** | TC-SO-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. `/sales/orders` → Buat Order
2. Pilih Customer, tanggal, lokasi sumber
3. Tipe: Make to Stock
4. Tambah item: produk, qty, harga, diskon, pajak
5. Simpan

**Diharapkan:** Order tersimpan, nomor auto-generate, status DRAFT, total amount benar (subtotal - diskon + pajak)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SO-002: Konfirmasi Sales Order
| **ID** | TC-SO-002 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Sales Order DRAFT → Konfirmasi

**Diharapkan:** Status → CONFIRMED, stok direservasi, order siap untuk delivery

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SO-003: Perhitungan Pajak & Diskon
| **ID** | TC-SO-003 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Buat SO dengan 2 item:
   - Item 1: 100 pcs × Rp 10.000, diskon 5%, pajak 11%
   - Item 2: 50 pcs × Rp 20.000, diskon 0%, pajak 11%
2. Periksa total

**Diharapkan:**
- Item 1: subtotal = 1.000.000, diskon = 50.000, pajak = 104.500
- Item 2: subtotal = 1.000.000, diskon = 0, pajak = 110.000
- Grand total dihitung benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## C. Delivery Order (Pengiriman)

### TC-DO-001: Buat Delivery Order
| **ID** | TC-DO-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. `/sales/deliveries` → Buat DO dari Sales Order
2. Pilih SO yang sudah CONFIRMED
3. Tentukan qty yang dikirim per item
4. Simpan

**Diharapkan:** DO tersimpan, stok berkurang sesuai qty kirim, deliveredQty di SO terupdate

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-DO-002: Partial Delivery (Kirim Sebagian)
| **ID** | TC-DO-002 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** SO item qty 100 → kirim 60 dulu → nanti kirim 40

**Diharapkan:** DO pertama: deliveredQty = 60, DO kedua: deliveredQty = 100, SO status update jika fully delivered

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## D. Invoice & Payment

### TC-INV-001: Buat Sales Invoice
| **ID** | TC-INV-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** `/sales/invoices` → Buat Invoice dari SO → Simpan

**Diharapkan:** Invoice tersimpan, nomor auto-generate, status UNPAID, total sesuai SO

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-INV-002: Catat Pembayaran
| **ID** | TC-INV-002 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Buka Invoice → Catat Pembayaran → isi jumlah, tanggal, metode → Simpan

**Diharapkan:** paidAmount bertambah, jika lunas status → PAID, jurnal otomatis dibuat (debit kas, kredit piutang)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-INV-003: Partial Payment (Bayar Sebagian)
| **ID** | TC-INV-003 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Invoice total Rp 1.000.000 → bayar Rp 500.000 → cek status

**Diharapkan:** Status tetap UNPAID/PARTIAL, paidAmount = 500.000, sisanya terlihat

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## E. Sales Return & Lainnya

### TC-RET-001: Buat Sales Return
| **ID** | TC-RET-001 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** `/sales/returns` → Buat Return → pilih SO → pilih item yg diretur → qty → alasan → Simpan

**Diharapkan:** Return tersimpan, stok bertambah kembali di lokasi, record tercatat

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SALE-001: Daftar Sales dengan Filter Tanggal
| **ID** | TC-SALE-001 | **Prioritas** | 🟢 P3 |
|--------|-------------|---------------|--------|

**Langkah:** Buka daftar SO → filter tanggal dari-sampai → periksa

**Diharapkan:** Hanya SO dalam rentang tanggal yg tampil

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SALE-002: Make to Order → Link ke Production
| **ID** | TC-SALE-002 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:** Buat SO tipe MAKE_TO_ORDER → konfirmasi → cek Production Order

**Diharapkan:** Production Order otomatis dibuat, terhubung dengan SO, SO menampilkan link ke PO

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Bagian | TC | Lulus | Gagal | Sebagian |
|--------|-----|-------|-------|----------|
| Quotation | 4 | | | |
| Sales Order | 3 | | | |
| Delivery | 2 | | | |
| Invoice & Payment | 3 | | | |
| Return & Lainnya | 3 | | | |
| **TOTAL** | **15** | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
