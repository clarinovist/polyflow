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

## F. Jadwal Kirim (Planning-First)

### TC-JK-001: Buat Jadwal Minggu Baru
| **ID** | TC-JK-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. `/sales/delivery-schedules` → klik "Jadwal Baru"
2. Pilih minggu yang belum punya jadwal

**Diharapkan:** Jadwal DRAFT dibuat dengan nomor JADWAL-YYYY-WXX otomatis

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-JK-002: Tambah Trip dengan Armada & Tanggal
| **ID** | TC-JK-002 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Buka jadwal DRAFT
2. Pilih kendaraan + tanggal berangkat (dalam rentang minggu)
3. Klik "Tambah Trip"

**Diharapkan:** Trip baru muncul dengan status "Direncanakan", badge PLANNED

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-JK-003: Multi-Trip Armada Sama Tanggal Beda
| **ID** | TC-JK-003 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Tambah trip armada B 1234 tanggal Senin
2. Tambah trip armada B 1234 tanggal Kamis

**Diharapkan:** Keduanya berhasil. Jika tanggal sama → error "sudah dijadwalkan"

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-JK-004: Assign SO ke Trip tanpa SJ
| **ID** | TC-JK-004 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Buka trip PLANNED/CONFIRMED
2. Klik "Tambah dari SO"
3. Pilih SO outstanding (sisa qty > 0)

**Diharapkan:** Stop "Belum SJ" muncul di trip, status PLANNED

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-JK-005: Generate Surat Jalan dari Trip
| **ID** | TC-JK-005 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Trip punya stop PLANNED dengan SO
2. Klik "Buat Semua SJ" atau icon SJ per stop
3. Cek `/sales/deliveries`

**Diharapkan:**
- DO baru muncul dengan status PENDING
- Stop status → GENERATED
- Vehicle & pricing terisi dari trip/tariff
- SO.shippingCost ter-sync

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-JK-006: Status Header DRAFT → Aktif → Selesai
| **ID** | TC-JK-006 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Jadwal DRAFT → klik "Aktifkan"
2. Semua trip COMPLETED → klik "Tutup Minggu"

**Diharapkan:**
- DRAFT → ACTIVE: berhasil
- ACTIVE → CLOSED: berhasil jika semua trip terminal
- Jika ada trip belum selesai → error "belum selesai"

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## H. Credit Limit (Batas Kredit) — Gelombang A

### TC-CR-001: Credit Limit Hard Block
| **ID** | TC-CR-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Prasyarat:** Customer dengan credit limit Rp 10.000.000, exposure saat ini Rp 9.000.000

**Langkah:**
1. Buat SO baru untuk customer tersebut dengan total Rp 2.000.000
2. Klik Confirm

**Diharapkan:** Confirm gagal, pesan error Bahasa Indonesia: "Batas kredit terlampaui. Limit: Rp 10.000.000, Exposure: Rp 9.000.000, Baru: Rp 2.000.000"

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-CR-002: Credit Exposure Banner
| **ID** | TC-CR-002 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Buka form buat/edit SO
2. Pilih customer yang memiliki credit limit

**Diharapkan:**
- Banner informasi kredit muncul dengan: Limit, Piutang belum lunas, SO aktif tanpa invoice, Exposure saat ini, Sisa headroom
- Warna hijau jika aman, kuning jika mendekati batas, merah jika akan melebihi

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## I. Customer Directory — Gelombang A

### TC-CU-001: Search & Filter Customer
| **ID** | TC-CU-001 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Buka `/sales/customers`
2. Ketik nama customer di search
3. Klik filter "Aktif", "Over Limit", "Punya Limit"

**Diharapkan:**
- Search memfilter customer berdasarkan nama/kode/telepon
- Filter menampilkan jumlah yang sesuai
- Badge "Over Limit" terlihat untuk customer yang melebihi batas kredit
- Badge "Mendekati Limit" untuk customer yang headroom < 10%

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## J. Sales Command Board (Papan Sales) — 2026-07-22

### TC-SA-HOME-001: Board Loads with KPI Cards
| **ID** | TC-SA-HOME-001 | **Prioritas** | 🔴 P1 |
|--------|----------------|---------------|--------|

**Langkah:**
1. Login sebagai SALES atau ADMIN
2. Buka `/sales`

**Diharapkan:**
- Halaman menampilkan 5 kartu KPI: DRAFT SO, Siap SJ, SJ Aktif, Trip Hari Ini, Overdue
- Bukan lagi chart wall / analytics dashboard lama
- Setiap kartu menampilkan angka count

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SA-HOME-002: Card Deep Links Work
| **ID** | TC-SA-HOME-002 | **Prioritas** | 🔴 P1 |
|--------|----------------|---------------|--------|

**Langkah:**
1. Buka `/sales`
2. Klik kartu "DRAFT SO"
3. Klik browser back
4. Klik kartu "SJ Aktif"
5. Klik browser back
6. Klik kartu "Overdue"

**Diharapkan:**
- Klik "DRAFT SO" → navigasi ke `/sales/orders?status=DRAFT`
- Klik "SJ Aktif" → navigasi ke `/sales/deliveries?status=PENDING`
- Klik "Overdue" → navigasi ke `/sales/invoices?status=OVERDUE`
- Filter di halaman tujuan sesuai dengan kartu yang diklik

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SA-HOME-003: DO LOADING Included in SJ Aktif Count
| **ID** | TC-SA-HOME-003 | **Prioritas** | 🔴 P1 |
|--------|----------------|---------------|--------|

**Prasyarat:** Ada Delivery Order dengan status LOADING

**Langkah:**
1. Buka `/sales`
2. Lihat kartu "SJ Aktif"

**Diharapkan:** Jumlah SJ Aktif = count DO dengan status PENDING + LOADING (bukan hanya PENDING)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SA-HOME-004: Attention Lists Display
| **ID** | TC-SA-HOME-004 | **Prioritas** | 🟡 P2 |
|--------|----------------|---------------|--------|

**Prasyarat:** Ada SO DRAFT > 0 hari, SO READY_TO_SHIP tanpa DO, DO PENDING/LOADING, invoice OVERDUE

**Langkah:**
1. Buka `/sales`
2. Scroll ke bagian "Butuh Perhatian"

**Diharapkan:**
- Section "Butuh Perhatian" tampil
- Setiap list menampilkan max 5 item
- Setiap item menampilkan nomor dokumen, nama customer, dan badge status
- Link "Lihat semua" di bawah setiap list

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SA-HOME-005: Quick Actions Work
| **ID** | TC-SA-HOME-005 | **Prioritas** | 🟡 P2 |
|--------|----------------|---------------|--------|

**Langkah:**
1. Buka `/sales`
2. Klik "+ Order Baru"
3. Klik browser back
4. Klik "+ Penawaran"
5. Klik browser back
6. Klik "Jadwal Kirim"
7. Klik browser back
8. Klik "Mode Mobile"

**Diharapkan:**
- "+ Order Baru" → `/sales/orders/new`
- "+ Penawaran" → `/sales/quotations/new`
- "Jadwal Kirim" → `/sales/delivery-schedules`
- "Mode Mobile" → `/sales/mobile`

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SA-HOME-006: Performance Strip Shows Revenue
| **ID** | TC-SA-HOME-006 | **Prioritas** | 🟢 P3 |
|--------|----------------|---------------|--------|

**Langkah:**
1. Buka `/sales`
2. Scroll ke bawah ke "Ringkas Performa"

**Diharapkan:**
- Omzet periode ditampilkan dalam format Rupiah
- Order aktif dan customer aktif terlihat
- Link "Performa lengkap" mengarah ke `/sales/reports/sales-performance`
- Definisi omzet (Jurnal akun 4*) terlihat

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## K. SO Detail — Shipping CTA Clarity

### TC-SA-SHIP-001: Shipping Path Guidance Alert
| **ID** | TC-SA-SHIP-001 | **Prioritas** | 🔴 P1 |
|--------|----------------|---------------|--------|

**Langkah:**
1. Buka SO dengan status READY_TO_SHIP
2. Lihat bagian atas detail SO

**Diharapkan:**
- Alert "Alur Kirim" tampil dengan copy: "Untuk rute harian multi-toko: pakai Jadwal Kirim. Untuk 1 SO hot-load: Buat Surat Jalan. Muat & tandai dikirim dikerjakan di Portal Gudang."
- Primary CTAs: "Buat Surat Jalan" + "Tambah ke Jadwal"
- ShipmentDialog ada di dropdown "⋮" (bukan button utama)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SA-SHIP-002: Tambah ke Jadwal Kirim Button
| **ID** | TC-SA-SHIP-002 | **Prioritas** | 🔴 P1 |
|--------|----------------|---------------|--------|

**Langkah:**
1. Buka SO dengan status CONFIRMED atau READY_TO_SHIP
2. Klik "Tambah ke Jadwal"

**Diharapkan:** Navigasi ke `/sales/delivery-schedules?addOrder={soId}`

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## L. Sidebar Navigation

### TC-SA-NAV-001: Sidebar Groups Correct
| **ID** | TC-SA-NAV-001 | **Prioritas** | 🟡 P2 |
|--------|----------------|---------------|--------|

**Langkah:**
1. Login sebagai SALES
2. Periksa sidebar navigation

**Diharapkan:**
- Group "Hari Ini": Papan Sales
- Group "Transaksi": Penawaran, Sales Order, Invoice & Piutang, Retur
- Group "Pengiriman": Jadwal Kirim, Surat Jalan, Armada
- Group "Pelanggan": Customer
- Group "Laporan": Performa Penjualan, Biaya Pengiriman
- Footer: Mode Mobile
- Portal name: "Portal Sales"

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Bagian | TC | Lulus | Gagal | Sebagian |
|--------|-----|-------|-------|----------|
| Quotation | 4 | | | |
| Sales Order | 3 | | | |
| Delivery | 2 | | | |
| Jadwal Kirim | 6 | | | |
| Invoice & Payment | 3 | | | |
| Return & Lainnya | 3 | | | |
| Credit Limit | 2 | | | |
| Customer Directory | 1 | | | |
| Command Board | 6 | | | |
| SO Detail Shipping CTA | 2 | | | |
| Sidebar Navigation | 1 | | | |
| **TOTAL** | **33** | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
