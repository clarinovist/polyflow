# 🏗️ UAT — Portal Gudang (Warehouse Portal)

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Portal Warehouse — Incoming, Outgoing, Inventori |
| **Halaman** | `/warehouse`, `/warehouse/incoming`, `/warehouse/outgoing`, `/warehouse/inventory` |
| **Login Sebagai** | WAREHOUSE |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Login sebagai user role WAREHOUSE
- Sudah ada PO CONFIRMED (untuk incoming)
- Sudah ada DO yang perlu dikirim (untuk outgoing)

---

### TC-WH-001: Akses Portal Warehouse
| **ID** | TC-WH-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Login sebagai WAREHOUSE → otomatis redirect ke `/warehouse`

**Diharapkan:** Halaman warehouse terbuka, sidebar menampilkan menu: Incoming, Outgoing, Inventory, Opname

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-WH-002: Penerimaan Barang dari PO
| **ID** | TC-WH-002 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. `/warehouse/incoming` → Pilih PO yang CONFIRMED
2. Input qty diterima → Simpan

**Diharapkan:** Stok bertambah di lokasi gudang, receipt tercatat, PO receivedQty terupdate

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-WH-003: Proses Pengiriman (Outgoing)
| **ID** | TC-WH-003 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. `/warehouse/outgoing` → Pilih DO yang perlu dikirim
2. Konfirmasi qty kirim → Proses

**Diharapkan:** Stok berkurang, status pengiriman terupdate, DO deliveredQty terupdate

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-WH-004: Navigasi Inventori per Lokasi
| **ID** | TC-WH-004 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** `/warehouse/inventory` → klik tab lokasi berbeda

**Diharapkan:** Stok tampil per lokasi, bisa switch antar lokasi dengan klik tab

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-WH-005: Transfer Stok dari Portal
| **ID** | TC-WH-005 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Dari inventori → Transfer → pilih asal & tujuan → qty → Transfer

**Diharapkan:** Transfer berhasil, stok berpindah, movement history tercatat

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-WH-006: Stok Opname dari Portal
| **ID** | TC-WH-006 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** `/warehouse/opname` → buat opname → input hitung → selesaikan

**Diharapkan:** Proses opname berjalan sama seperti dari akses ADMIN

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-WH-007: Isolasi Akses — Tidak Bisa Akses Module Lain
| **ID** | TC-WH-007 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Coba akses `/dashboard`, `/production`, `/finance`, `/sales` manual via address bar

**Diharapkan:** Semua dialihkan kembali ke `/warehouse`

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-WH-008: Stok Terupdate Real-Time
| **ID** | TC-WH-008 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Buka inventori → dari tab/window lain lakukan transfer → refresh

**Diharapkan:** Stok terupdate setelah refresh

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Total TC | Lulus | Gagal | Sebagian |
|----------|-------|-------|----------|
| 8 | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
