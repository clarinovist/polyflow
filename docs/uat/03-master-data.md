# 📦 UAT — Modul Data Master (Produk, BOM, Mesin)

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Data Master — Produk, Bill of Materials, Mesin, Karyawan, Supplier, Customer |
| **Halaman Terkait** | `/dashboard/products`, `/dashboard/boms`, `/dashboard/machines`, `/dashboard/employees`, `/sales/customers`, `/planning/suppliers` |
| **Login Sebagai** | ADMIN |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat

- Login sebagai ADMIN
- Siapkan data contoh: nama produk, kode SKU, nama supplier, nama customer

---

## A. Manajemen Produk

---

### TC-PROD-001: Buat Produk Baru

| Field | Detail |
|-------|--------|
| **ID** | TC-PROD-001 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan bisa membuat produk baru dengan varian |

**Langkah-langkah:**

1. Buka `/dashboard/products`
2. Klik tombol **Buat Produk / Create Product**
3. Isi detail produk:
   - **Nama Produk**: contoh "PP Granule Merah"
   - **Tipe Produk**: pilih **RAW_MATERIAL**
4. Di bagian **Varian**, tambahkan varian:
   - **Nama Varian**: "PP Granule Merah Standard"
   - **Kode SKU**: "RM-PP-RED-01"
   - **Satuan Utama**: KG
   - **Satuan Jual**: BAL
   - **Faktor Konversi**: 25 (artinya 1 BAL = 25 KG)
   - **Harga Beli**: 15000
   - **Harga Jual**: 20000
   - **Batas Minimum Stok**: 100
5. Klik **Simpan**

**Hasil yang Diharapkan:**

- Produk berhasil tersimpan
- Muncul di daftar produk
- Semua data yang diisi tersimpan dengan benar
- SKU unik — tidak bentrok dengan produk lain

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-PROD-002: Validasi SKU Duplikat

| Field | Detail |
|-------|--------|
| **ID** | TC-PROD-002 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan sistem menolak SKU yang sudah dipakai produk lain |

**Langkah-langkah:**

1. Catat kode SKU dari produk yang sudah ada
2. Buat produk baru dan gunakan **kode SKU yang sama**
3. Klik **Simpan**

**Hasil yang Diharapkan:**

- Sistem **menolak** penyimpanan
- Muncul pesan error: "Kode SKU sudah digunakan" atau sejenisnya
- Data tidak tersimpan ganda

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-PROD-003: Lihat Daftar Produk

| Field | Detail |
|-------|--------|
| **ID** | TC-PROD-003 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan daftar produk tampil lengkap |

**Langkah-langkah:**

1. Buka `/dashboard/products`
2. Perhatikan tabel daftar produk

**Hasil yang Diharapkan:**

- Semua produk yang sudah dibuat tampil di tabel
- Terlihat kolom: Nama, Tipe, SKU, Satuan, Harga
- Jika ada banyak produk, ada fitur **pagination** (halaman 1, 2, 3...)
- Bisa klik baris produk untuk melihat detail

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-PROD-004: Edit Produk

| Field | Detail |
|-------|--------|
| **ID** | TC-PROD-004 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan bisa mengubah data produk yang sudah ada |

**Langkah-langkah:**

1. Buka `/dashboard/products`
2. Klik produk yang sudah ada untuk masuk ke detail
3. Klik tombol **Edit**
4. Ubah **nama produk** menjadi nama baru
5. Ubah **harga jual** ke angka yang berbeda
6. Klik **Simpan**

**Hasil yang Diharapkan:**

- Perubahan **tersimpan** dengan sukses
- Kembali ke halaman detail, data sudah terupdate
- Kembali ke daftar, nama produk sudah berubah

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-PROD-005: Hapus Produk Tanpa Stok

| Field | Detail |
|-------|--------|
| **ID** | TC-PROD-005 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan bisa menghapus produk yang tidak punya stok |

**Langkah-langkah:**

1. Buat produk baru (atau pilih produk yang **tidak memiliki stok** di gudang mana pun)
2. Buka detail produk tersebut
3. Klik tombol **Hapus**
4. Konfirmasi penghapusan

**Hasil yang Diharapkan:**

- Produk **berhasil dihapus**
- Produk hilang dari daftar
- Tidak ada error

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-PROD-006: Hapus Produk yang Masih Punya Stok (Harus Ditolak)

| Field | Detail |
|-------|--------|
| **ID** | TC-PROD-006 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan sistem melindungi produk yang masih ada stoknya |

**Langkah-langkah:**

1. Pilih produk yang **masih memiliki stok** di gudang
2. Coba **hapus** produk tersebut

**Hasil yang Diharapkan:**

- Sistem **menolak** penghapusan
- Muncul pesan error: "Tidak bisa menghapus produk yang masih memiliki stok" atau sejenisnya
- Data produk tetap aman

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-PROD-007: Semua Tipe Produk Tersedia

| Field | Detail |
|-------|--------|
| **ID** | TC-PROD-007 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan semua 6 tipe produk bisa dipilih |

**Langkah-langkah:**

1. Buka form **Buat Produk**
2. Klik dropdown **Tipe Produk**
3. Periksa semua pilihan yang tersedia

**Hasil yang Diharapkan:**

Dropdown berisi 6 tipe:
- ✅ RAW_MATERIAL (Bahan Baku)
- ✅ INTERMEDIATE (Bahan Antara/Setengah Jadi)
- ✅ PACKAGING (Kemasan)
- ✅ WIP (Barang Dalam Proses)
- ✅ FINISHED_GOOD (Barang Jadi)
- ✅ SCRAP (Limbah/Affal)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-PROD-008: Multi-Varian dalam Satu Produk

| Field | Detail |
|-------|--------|
| **ID** | TC-PROD-008 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan satu produk bisa memiliki beberapa varian |

**Langkah-langkah:**

1. Buat produk baru
2. Tambahkan **3 varian** dengan SKU berbeda:
   - Varian 1: "Standard" — SKU: "TEST-01"
   - Varian 2: "Premium" — SKU: "TEST-02"
   - Varian 3: "Economy" — SKU: "TEST-03"
3. Simpan produk

**Hasil yang Diharapkan:**

- Produk tersimpan dengan **3 varian**
- Di halaman detail, ketiga varian terlihat
- Masing-masing varian punya SKU unik

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-PROD-009: Riwayat Perubahan Harga (Cost History)

| Field | Detail |
|-------|--------|
| **ID** | TC-PROD-009 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan perubahan harga standar (standard cost) tercatat |

**Langkah-langkah:**

1. Buka detail produk yang sudah memiliki riwayat penerimaan barang (Goods Receipt)
2. Cari bagian **Riwayat Harga / Cost History**
3. Perhatikan tabel riwayat perubahan harga

**Hasil yang Diharapkan:**

- Terlihat tabel dengan kolom: Tanggal, Harga Lama, Harga Baru, Alasan Perubahan, % Perubahan
- Setiap kali ada penerimaan barang (GR), harga otomatis terupdate dan tercatat di sini
- Ada grafik tren perubahan harga

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

## B. Bill of Materials (BOM) — Resep Produksi

---

### TC-BOM-001: Buat BOM Baru

| Field | Detail |
|-------|--------|
| **ID** | TC-BOM-001 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan bisa membuat resep produksi (BOM) baru |

**Langkah-langkah:**

1. Buka `/dashboard/boms`
2. Klik **Buat BOM / Create BOM**
3. Isi:
   - **Nama BOM**: "Resep Mixing PP Merah"
   - **Produk Output**: pilih produk tipe INTERMEDIATE atau FINISHED_GOOD
   - **Jumlah Output**: 100 (artinya resep ini untuk menghasilkan 100 KG)
   - **Kategori**: EXTRUSION
4. Tambahkan **bahan/material**:
   - Bahan 1: PP Granule — Qty: 98 KG — Scrap: 1%
   - Bahan 2: Pewarna Merah — Qty: 2 KG — Scrap: 0%
5. Klik **Simpan**

**Hasil yang Diharapkan:**

- BOM berhasil tersimpan
- Muncul di daftar BOM
- Total biaya per unit (Cost/Unit) otomatis terhitung
- Bahan-bahan terlihat di detail BOM

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-BOM-002: Lihat Detail BOM & Cost per Unit

| Field | Detail |
|-------|--------|
| **ID** | TC-BOM-002 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan biaya per unit (Cost/Unit) tampil dihitung dengan benar |

**Langkah-langkah:**

1. Buka `/dashboard/boms`
2. Klik salah satu BOM untuk lihat detail
3. Perhatikan kolom **Cost/Unit** dan **Total Cost**

**Hasil yang Diharapkan:**

- **Cost/Unit** = Total biaya formula / Jumlah output
- Contoh: jika total bahan = Rp 1.500.000 untuk 100 KG, maka Cost/Unit = Rp 15.000/KG
- Angka sesuai dengan harga beli bahan × kuantitas

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-BOM-003: Sorting (Urutan) Cost/Unit

| Field | Detail |
|-------|--------|
| **ID** | TC-BOM-003 |
| **Prioritas** | 🟢 P3 — Pelengkap |
| **Tujuan** | Memastikan daftar BOM bisa diurutkan berdasarkan Cost/Unit |

**Langkah-langkah:**

1. Buka daftar BOM `/dashboard/boms`
2. Klik header kolom **Cost/Unit**
3. Perhatikan urutan data

**Hasil yang Diharapkan:**

- Klik pertama: urut dari **termurah ke termahal** (ascending)
- Klik kedua: urut dari **termahal ke termurah** (descending)
- Klik ketiga: kembali ke urutan default

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-BOM-004: Edit BOM

| Field | Detail |
|-------|--------|
| **ID** | TC-BOM-004 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan bisa mengubah resep/formula BOM |

**Langkah-langkah:**

1. Buka detail BOM yang sudah ada
2. Klik **Edit**
3. Ubah kuantitas salah satu bahan
4. Tambahkan 1 bahan baru
5. Klik **Simpan**

**Hasil yang Diharapkan:**

- Perubahan berhasil tersimpan
- Cost/Unit otomatis **terupdate** sesuai perubahan
- Bahan baru muncul di daftar bahan

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-BOM-005: Hapus BOM

| Field | Detail |
|-------|--------|
| **ID** | TC-BOM-005 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan BOM bisa dihapus |

**Langkah-langkah:**

1. Pilih BOM yang **tidak digunakan** di Work Order aktif
2. Klik **Hapus**
3. Konfirmasi penghapusan

**Hasil yang Diharapkan:**

- BOM berhasil dihapus dari daftar
- Jika BOM sedang dipakai oleh Production Order aktif, penghapusan **ditolak**

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-BOM-006: Kategori BOM (EXTRUSION, PACKING, STANDARD)

| Field | Detail |
|-------|--------|
| **ID** | TC-BOM-006 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan semua kategori BOM tersedia dan berfungsi |

**Langkah-langkah:**

1. Buka form buat/edit BOM
2. Periksa dropdown **Kategori BOM**
3. Buat 3 BOM masing-masing dengan kategori berbeda

**Hasil yang Diharapkan:**

- Kategori yang tersedia: **STANDARD**, **EXTRUSION**, **PACKING**
- Masing-masing kategori tersimpan dengan benar
- Kategori ini mempengaruhi lokasi pengambilan bahan saat produksi (EXTRUSION → Mixing Area, PACKING → Finishing)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

## C. Manajemen Mesin

---

### TC-MACH-001: Buat Mesin Baru

| Field | Detail |
|-------|--------|
| **ID** | TC-MACH-001 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan bisa menambahkan mesin produksi baru |

**Langkah-langkah:**

1. Buka `/dashboard/machines`
2. Klik **Tambah Mesin**
3. Isi:
   - **Nama**: "Extruder Jumbo 02"
   - **Kode Mesin**: "EXT-02"
   - **Tipe**: EXTRUDER
   - **Lokasi**: Extrusion Area
   - **Status**: ACTIVE
   - **Biaya per Jam**: 50000
4. Klik **Simpan**

**Hasil yang Diharapkan:**

- Mesin berhasil tersimpan
- Muncul di daftar mesin dengan status ACTIVE
- Kode mesin unik — tidak boleh duplikat

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-MACH-002: Semua Tipe Mesin Tersedia

| Field | Detail |
|-------|--------|
| **ID** | TC-MACH-002 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan semua 5 tipe mesin tersedia |

**Langkah-langkah:**

1. Buka form tambah mesin
2. Klik dropdown **Tipe Mesin**

**Hasil yang Diharapkan:**

- ✅ MIXER (Mesin Mixing/Pencampuran)
- ✅ EXTRUDER (Mesin Ekstrusi)
- ✅ REWINDER (Mesin Rewinding/Gulung Ulang)
- ✅ PACKER (Mesin Packing/Pengemasan)
- ✅ GRANULATOR (Mesin Granulasi/Recycle)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-MACH-003: Ubah Status Mesin

| Field | Detail |
|-------|--------|
| **ID** | TC-MACH-003 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan status mesin bisa diubah |

**Langkah-langkah:**

1. Buka detail mesin yang statusnya **ACTIVE**
2. Ubah status menjadi **MAINTENANCE**
3. Simpan
4. Ubah lagi menjadi **BROKEN**
5. Simpan

**Hasil yang Diharapkan:**

- Status berubah dan tersimpan di setiap perubahan
- Status ditampilkan dengan **warna berbeda**:
  - ACTIVE → hijau
  - MAINTENANCE → kuning/oranye
  - BROKEN → merah

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

## D. Master Data Lainnya

---

### TC-CUST-001: Buat Customer Baru

| Field | Detail |
|-------|--------|
| **ID** | TC-CUST-001 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan bisa menambahkan data customer |

**Langkah-langkah:**

1. Buka `/sales/customers`
2. Klik **Tambah Customer**
3. Isi: Nama, Kode, Telepon, Email, Alamat Kirim, NPWP, Limit Kredit, Term Pembayaran
4. Simpan

**Hasil yang Diharapkan:**

- Customer tersimpan dengan semua field
- Muncul di daftar customer
- Bisa digunakan saat membuat Sales Order / Quotation

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-SUPP-001: Buat Supplier Baru

| Field | Detail |
|-------|--------|
| **ID** | TC-SUPP-001 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan bisa menambahkan data supplier |

**Langkah-langkah:**

1. Buka `/planning/suppliers`
2. Klik **Tambah Supplier**
3. Isi: Nama, Kode, Telepon, Email, Alamat, NPWP, Bank, No Rekening, Term Pembayaran
4. Simpan

**Hasil yang Diharapkan:**

- Supplier tersimpan dengan semua field
- Muncul di daftar supplier
- Bisa digunakan saat membuat Purchase Order

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-EMP-001: Buat Karyawan / Operator Baru

| Field | Detail |
|-------|--------|
| **ID** | TC-EMP-001 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan bisa menambahkan data karyawan/operator |

**Langkah-langkah:**

1. Buka `/dashboard/employees`
2. Klik **Tambah Karyawan**
3. Isi: Nama, Kode Karyawan, Role/Bagian, Status, Upah per Jam
4. Simpan

**Hasil yang Diharapkan:**

- Karyawan tersimpan
- Kode karyawan unik
- Karyawan bisa dipilih sebagai operator di Kiosk dan Production Order

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-SUPP-002: Hubungkan Supplier dengan Produk

| Field | Detail |
|-------|--------|
| **ID** | TC-SUPP-002 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan bisa menghubungkan supplier ke produk tertentu |

**Langkah-langkah:**

1. Buka detail supplier
2. Cari bagian **Produk yg Disuplai / Supplier Products**
3. Tambahkan hubungan ke produk bahan baku:
   - Pilih produk
   - Isi harga per unit
   - Isi lead time (hari)
   - Isi minimum order
4. Simpan

**Hasil yang Diharapkan:**

- Hubungan supplier-produk tersimpan
- Saat membuat PO, supplier ini bisa dipilih untuk produk terkait
- Harga otomatis terisi sesuai data supplier-produk

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

## Ringkasan Hasil

| Bagian | Total TC | Lulus | Gagal | Sebagian |
|--------|----------|-------|-------|----------|
| Produk | 9 | | | |
| BOM | 6 | | | |
| Mesin | 3 | | | |
| Customer/Supplier/Karyawan | 4 | | | |
| **TOTAL** | **22** | | | |

**Tanda Tangan Tester:** _________________________

**Tanggal:** ____/____/________
