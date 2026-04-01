# 📦 UAT — Modul Manajemen Inventori & Stok Opname

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Inventori, Transfer, Adjustment, Movement History, Stok Opname |
| **Halaman** | `/warehouse/inventory`, `/warehouse/opname` |
| **Login Sebagai** | ADMIN atau WAREHOUSE |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Produk dengan stok di berbagai lokasi gudang sudah tersedia
- Minimal 5 lokasi gudang (RM Warehouse, Mixing, Extrusion, FG, Scrap)

---

## A. Tampilan Inventori

### TC-INV-001: Lihat Stok Semua Lokasi
| **ID** | TC-INV-001 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:** Buka `/warehouse/inventory` → periksa tab lokasi gudang

**Diharapkan:** Tab horizontal per lokasi, klik tab menampilkan stok lokasi tsb, kolom: Nama, SKU, Qty, Satuan, Min Stok

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-INV-002: Filter Tipe Produk
| **ID** | TC-INV-002 | **Prioritas** | 🟡 P2 |
|--------|------------|---------------|--------|

**Langkah:** Filter dropdown Tipe → pilih RAW_MATERIAL → ganti FINISHED_GOOD

**Diharapkan:** Tabel hanya tampil produk sesuai tipe, hapus filter → semua muncul

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-INV-003: Highlight Stok Rendah
| **ID** | TC-INV-003 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:** Pastikan ada produk stok < minStockAlert → periksa tampilan

**Diharapkan:** Baris produk stok rendah berlatar kuning, angka berwarna merah

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-INV-004: Ubah Batas Minimum Stok
| **ID** | TC-INV-004 | **Prioritas** | 🟡 P2 |
|--------|------------|---------------|--------|

**Langkah:** Klik baris produk → dialog threshold → ubah ke 500 → Simpan

**Diharapkan:** Nilai tersimpan, highlight stok rendah terupdate sesuai threshold baru

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-INV-005: Kolom Reserved & Available
| **ID** | TC-INV-005 | **Prioritas** | 🟡 P2 |
|--------|------------|---------------|--------|

**Langkah:** Cari produk yg punya reservasi → periksa kolom Reserved dan Available

**Diharapkan:** Available = Total - Reserved, perhitungan benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## B. Transfer Stok

### TC-TRF-001: Transfer Stok Berhasil
| **ID** | TC-TRF-001 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:**
1. Buka Transfer Stok
2. Asal: RM Warehouse → Tujuan: Mixing Area
3. Pilih produk yg ada stok, qty: 50 KG, isi catatan
4. Klik Transfer

**Diharapkan:** Stok asal -50, stok tujuan +50, muncul record TRANSFER di Movement History

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-TRF-002: Transfer Melebihi Stok (Ditolak)
| **ID** | TC-TRF-002 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:** Produk stok 100 → coba transfer 200

**Diharapkan:** DITOLAK, pesan error "Stok tidak cukup", stok tidak berubah

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-TRF-003: Transfer ke Lokasi Sama (Ditolak)
| **ID** | TC-TRF-003 | **Prioritas** | 🟡 P2 |
|--------|------------|---------------|--------|

**Langkah:** Pilih lokasi asal dan tujuan sama → coba transfer

**Diharapkan:** DITOLAK atau tidak diizinkan memilih

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## C. Adjustment Stok

### TC-ADJ-001: Adjustment IN (Tambah)
| **ID** | TC-ADJ-001 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:** Stock Adjustment → Lokasi → Produk → Tipe: IN → Qty: 100 → Alasan → Simpan

**Diharapkan:** Stok +100, record ADJUSTMENT di Movement History beserta alasan

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-ADJ-002: Adjustment OUT (Kurang)
| **ID** | TC-ADJ-002 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:** Tipe: OUT → Qty: 30 → Alasan: "Barang rusak" → Simpan

**Diharapkan:** Stok -30, tercatat di Movement History

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-ADJ-003: Adjustment OUT Melebihi Stok (Ditolak)
| **ID** | TC-ADJ-003 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:** Stok 50 → coba OUT 100

**Diharapkan:** DITOLAK, stok tidak boleh negatif

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## D. Riwayat Pergerakan

### TC-MOV-001: Lihat Semua Riwayat
| **ID** | TC-MOV-001 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:** Buka Movement History

**Diharapkan:** Semua pergerakan tampil: Tanggal, Produk, Tipe, Qty, Dari, Ke, User

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-MOV-002: Filter Berdasarkan Tipe
| **ID** | TC-MOV-002 | **Prioritas** | 🟡 P2 |
|--------|------------|---------------|--------|

**Langkah:** Filter → TRANSFER → hanya transfer yg muncul → ganti ADJUSTMENT

**Diharapkan:** Filter berfungsi, data tersaring sesuai tipe

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-MOV-003: Atribusi User
| **ID** | TC-MOV-003 | **Prioritas** | 🟡 P2 |
|--------|------------|---------------|--------|

**Langkah:** Lakukan transfer → cek Movement History → periksa kolom User

**Diharapkan:** Nama user yg melakukan tercantum di kolom User

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## E. Stok Opname

### TC-OPN-001: Buat Sesi Opname
| **ID** | TC-OPN-001 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:** `/warehouse/opname` → Buat Opname → Pilih Lokasi → Buat

**Diharapkan:** Sesi dibuat, nomor auto-generate, status OPEN, item terisi otomatis dengan stok sistem

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-OPN-002: Input Hasil Hitung Fisik
| **ID** | TC-OPN-002 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:** Buka opname → Counter → input counted qty per item → Simpan

**Diharapkan:** Angka tersimpan, selisih (variance) otomatis terhitung

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-OPN-003: Selesaikan Opname
| **ID** | TC-OPN-003 | **Prioritas** | 🔴 P1 |
|--------|------------|---------------|--------|

**Langkah:** Klik Selesaikan/Complete pada sesi opname yang sudah diisi

**Diharapkan:** Status → COMPLETED, stok otomatis disesuaikan via adjustment, tidak bisa diedit lagi

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-OPN-004: Hapus Opname OPEN
| **ID** | TC-OPN-004 | **Prioritas** | 🟡 P2 |
|--------|------------|---------------|--------|

**Langkah:** Buat opname baru → hapus sebelum diselesaikan

**Diharapkan:** OPEN bisa dihapus, COMPLETED tidak bisa dihapus

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-OPN-005: Opname Kosong Ditolak
| **ID** | TC-OPN-005 | **Prioritas** | 🟡 P2 |
|--------|------------|---------------|--------|

**Langkah:** Coba buat opname di lokasi tanpa stok

**Diharapkan:** DITOLAK, pesan "Tidak ada item di lokasi ini"

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Bagian | TC | Lulus | Gagal | Sebagian |
|--------|-----|-------|-------|----------|
| Tampilan Inventori | 5 | | | |
| Transfer Stok | 3 | | | |
| Adjustment | 3 | | | |
| Riwayat | 3 | | | |
| Stok Opname | 5 | | | |
| **TOTAL** | **19** | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
