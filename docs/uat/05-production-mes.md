# 🏭 UAT — Modul Produksi & Eksekusi Pabrik (MES)

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Production Order, Material Issuance, Backflush, Output/Scrap, Costing |
| **Halaman** | `/production`, `/production/machines`, `/production/costing` |
| **Login Sebagai** | ADMIN atau PRODUCTION |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Sudah ada BOM (resep produksi) minimal 2
- Sudah ada mesin yang aktif
- Sudah ada stok bahan baku di lokasi yang sesuai
- Sudah ada karyawan/operator

---

## A. Production Order (Work Order)

### TC-PROD-001: Buat Production Order
| **ID** | TC-PROD-001 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Buka `/production` → Buat Order Baru
2. Pilih BOM (resep)
3. Qty: 500 KG, Tanggal Mulai: hari ini
4. Pilih mesin & lokasi
5. Simpan

**Diharapkan:** Order dibuat, status DRAFT, nomor order auto-generate, material plan otomatis terhitung dari BOM

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PROD-002: Release Order (Lepas ke Produksi)
| **ID** | TC-PROD-002 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:** Buka order DRAFT → klik Release/Lepas

**Diharapkan:** Status berubah DRAFT → RELEASED, order muncul di daftar kiosk & warehouse

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PROD-003: Start Job (Mulai Produksi)
| **ID** | TC-PROD-003 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:** Dari Kiosk atau halaman Production → klik START JOB pada order RELEASED

**Diharapkan:** Status → IN_PROGRESS, waktu mulai aktual tercatat. **PENTING:** Stok TIDAK berkurang saat START (hanya berubah saat output/backflush)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PROD-004: Complete Order
| **ID** | TC-PROD-004 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:** Setelah output dilogkan → klik Complete/Selesaikan order

**Diharapkan:** Status → COMPLETED, waktu selesai tercatat, order tidak bisa diedit lagi

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PROD-005: Cancel Order
| **ID** | TC-PROD-005 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:** Buat order baru → Release → coba Cancel

**Diharapkan:** Status → CANCELLED, order tidak bisa di-start lagi

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## B. Material Issuance (Pengambilan Bahan)

### TC-MAT-001: Issue Material (Ambil Bahan)
| **ID** | TC-MAT-001 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Buka detail Production Order yg RELEASED/IN_PROGRESS
2. Klik **Ambil Bahan / Issue Material**
3. Pilih bahan, qty sesuai plan
4. Konfirmasi

**Diharapkan:** Stok bahan baku berkurang di lokasi sumber, record MaterialIssue dibuat, total issued bertambah

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-MAT-002: Partial Issue (Ambil Sebagian)
| **ID** | TC-MAT-002 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:** Plan butuh 100 KG → issue 50 KG dulu → nanti issue 50 KG lagi

**Diharapkan:** Kedua issuance tercatat, total issued = 100 KG, stok berkurang 2 kali masing-masing 50

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-MAT-003: Issue Melebihi Plan (Over-Issue)
| **ID** | TC-MAT-003 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:** Plan butuh 100 KG → coba issue 120 KG

**Diharapkan:** Sistem MENGIZINKAN over-issue (sesuai kebijakan trust-based), stok berkurang 120

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-MAT-004: Issue Melebihi Stok (Ditolak)
| **ID** | TC-MAT-004 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:** Stok tersedia 80 KG → coba issue 100 KG

**Diharapkan:** DITOLAK, pesan "Stok tidak mencukupi", stok tidak berubah

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## C. Output & Scrap (Hasil Produksi)

### TC-OUT-001: Log Output Produksi
| **ID** | TC-OUT-001 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Buka order yg IN_PROGRESS
2. Klik Log Output
3. Qty Good: 480 KG
4. Scrap Prongkol: 10 KG, Scrap Daun: 10 KG
5. Simpan

**Diharapkan:** 
- Stok barang jadi +480 KG di lokasi output
- Stok SCRAP-PRONGKOL +10 KG di Scrap Warehouse
- Stok SCRAP-DAUN +10 KG di Scrap Warehouse
- Actual qty di order terupdate

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-OUT-002: Backflush Otomatis
| **ID** | TC-OUT-002 | **Prioritas** | 🔴 P1 |
|--------|-------------|---------------|--------|

**Langkah:**
1. Catat stok bahan baku di Mixing Area SEBELUM log output
2. Log output (good: 480 + scrap: 20 = total 500)
3. Cek stok bahan baku di Mixing Area SETELAH log output

**Diharapkan:**
- Bahan baku otomatis berkurang berdasarkan formula: (output + scrap) × rasio konsumsi
- Untuk BOM kategori EXTRUSION → pengurangan dari Mixing Area
- Untuk BOM kategori PACKING → pengurangan dari Finishing/FG
- Total pengurangan bahan = 500 × (BOM ratio)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-OUT-003: Running Output (Output Parsial)
| **ID** | TC-OUT-003 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:** Saat order IN_PROGRESS → log output 200 KG → lalu 150 KG → lalu 130 KG

**Diharapkan:** Setiap log menambah stok, total actual = 480, backflush berjalan tiap kali

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## D. Fitur Produksi Lainnya

### TC-PROD-006: Material Substitusi
| **ID** | TC-PROD-006 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:** Buka plan material order → tambah bahan baru yg tidak ada di BOM → hapus bahan yg belum di-issue

**Diharapkan:** Bisa tambah bahan baru, bisa hapus bahan yg issued qty = 0, TIDAK bisa hapus bahan yg sudah di-issue

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PROD-007: Work Order Hierarchy (Parent-Child)
| **ID** | TC-PROD-007 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:** Buat order yg punya child order (dari MRP) → periksa hierarki

**Diharapkan:** Parent order menampilkan child orders, child mereferensikan parent

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PROD-008: Machine Downtime
| **ID** | TC-PROD-008 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:** Di halaman mesin → catat downtime: alasan, waktu mulai, waktu selesai

**Diharapkan:** Downtime tercatat, total downtime hours terhitung di KPI

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PROD-009: Production Shift
| **ID** | TC-PROD-009 | **Prioritas** | 🟢 P3 |
|--------|-------------|---------------|--------|

**Langkah:** Buka order → tab Shift → tambah shift: nama, operator, jam mulai/selesai, output

**Diharapkan:** Shift tercatat, operator terhubung, output per shift terlihat

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-PROD-010: Production Costing (COGM)
| **ID** | TC-PROD-010 | **Prioritas** | 🟡 P2 |
|--------|-------------|---------------|--------|

**Langkah:** Buka `/production/costing` → periksa laporan biaya produksi

**Diharapkan:** Tampil breakdown: Material Cost, Conversion Cost, Total COGM, Cost per Unit

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Bagian | TC | Lulus | Gagal | Sebagian |
|--------|-----|-------|-------|----------|
| Production Order | 5 | | | |
| Material Issuance | 4 | | | |
| Output & Scrap | 3 | | | |
| Lainnya | 5 | | | |
| **TOTAL** | **17** | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
