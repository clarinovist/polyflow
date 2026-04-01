# 📊 UAT — Modul Dashboard & Analitik

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Dashboard Utama & Analitik Bisnis |
| **Halaman Terkait** | `/dashboard` |
| **Login Sebagai** | ADMIN (untuk akses penuh) |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat

- Login sebagai user dengan role **ADMIN**
- Sudah ada data produk, inventori, dan transaksi (minimal beberapa record)
- Sudah ada beberapa production order (untuk KPI produksi)

---

## Test Cases

---

### TC-DASH-001: Tampilan Dashboard Utama

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-001 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan halaman dashboard utama tampil dengan benar |

**Langkah-langkah:**

1. Login sebagai ADMIN
2. Buka halaman `/dashboard`
3. Perhatikan elemen-elemen yang tampil di halaman

**Hasil yang Diharapkan:**

- Halaman dashboard tampil tanpa error
- Terlihat **kartu-kartu KPI (Key Performance Indicator)** di bagian atas:
  - Total Produk
  - Total Stok
  - Stok Rendah (Low Stock)
  - Pergerakan Aktif (Movements)
  - Nilai Inventori
  - Produksi Pending
- Terlihat bagian **Quick Actions** (tombol aksi cepat)
- Seluruh tata letak (layout) rapi, tidak ada elemen yang tumpang tindih

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-002: Data KPI Sesuai dengan Data Aktual

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-002 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan angka-angka KPI di dashboard sesuai dengan kondisi data sebenarnya |

**Langkah-langkah:**

1. Buka halaman `/dashboard`
2. Catat angka **Total Produk** yang tampil
3. Buka `/dashboard/products` dan hitung jumlah produk — bandingkan
4. Catat angka **Stok Rendah** di dashboard
5. Buka `/warehouse/inventory` dan hitung berapa produk yang berstok di bawah batas — bandingkan
6. Catat angka **Produksi Pending** di dashboard
7. Buka `/production` dan hitung order yang statusnya belum COMPLETED — bandingkan

**Hasil yang Diharapkan:**

- Angka **Total Produk** di dashboard = jumlah produk di halaman products
- Angka **Stok Rendah** di dashboard = jumlah produk di bawah threshold
- Angka **Produksi Pending** = jumlah work order yang belum selesai
- Tidak ada perbedaan angka antara dashboard dan halaman detail

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-003: Tombol Quick Action Berfungsi

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-003 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan tombol-tombol aksi cepat mengarah ke halaman yang benar |

**Langkah-langkah:**

1. Di halaman dashboard, cari bagian **Quick Actions**
2. Klik tombol **Buat Produk** → catat halaman yang terbuka
3. Kembali ke dashboard
4. Klik tombol **Stock Adjustment** → catat halaman yang terbuka
5. Kembali ke dashboard
6. Klik tombol **Internal Transfer** → catat halaman yang terbuka

**Hasil yang Diharapkan:**

- **Buat Produk** → membuka halaman `/dashboard/products/create`
- **Stock Adjustment** → membuka halaman adjustment stok
- **Internal Transfer** → membuka halaman transfer internal
- Setiap klik membuka halaman yang benar, tanpa error

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-004: Kartu Stok Rendah (Low Stock Alert)

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-004 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan peringatan stok rendah tampil ketika stok di bawah batas minimum |

**Langkah-langkah:**

1. Pastikan ada minimal 1 produk yang stoknya di bawah nilai **Batas Minimum Stok** (minStockAlert)
2. Buka halaman `/dashboard`
3. Perhatikan kartu **Stok Rendah**

**Hasil yang Diharapkan:**

- Kartu menunjukkan angka > 0 jika ada produk di bawah threshold
- Kartu memiliki **warna peringatan** (kuning/amber) jika ada stok rendah
- Angka sesuai dengan jumlah produk yang benar-benar di bawah batas

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-005: Nilai Inventori (Inventory Valuation)

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-005 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan nilai total inventori dihitung dengan benar |

**Langkah-langkah:**

1. Buka halaman `/dashboard`
2. Lihat kartu **Nilai Inventori**
3. Catat angka yang tampil
4. Cek apakah angka ini masuk akal (total stok × harga rata-rata per produk)

**Hasil yang Diharapkan:**

- Nilai inventori tampil dalam format mata uang (Rp)
- Angka bukan nol (jika ada stok)
- Perhitungan menggunakan metode **Weighted Average** (Rata-rata Tertimbang)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-006: Dashboard Executive KPIs (Manufaktur)

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-006 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan KPI khusus manufaktur tampil di executive dashboard |

**Langkah-langkah:**

1. Buka halaman `/dashboard`
2. Cari bagian Executive Dashboard atau KPI Manufaktur
3. Periksa apakah metrik berikut tampil:
   - **Yield Rate (%)** — persentase output vs input
   - **Total Scrap (Kg)** — total limbah produksi
   - **Downtime Hours** — jam mesin mati
   - **Machine Utilization** — % penggunaan mesin

**Hasil yang Diharapkan:**

- Semua 4 metrik tampil dengan angka yang jelas
- Angka Yield Rate dalam bentuk persentase (contoh: 95.5%)
- Total Scrap dalam kilogram
- Downtime dalam jam

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-007: Dark Mode (Mode Gelap)

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-007 |
| **Prioritas** | 🟢 P3 — Pelengkap |
| **Tujuan** | Memastikan tampilan mode gelap berfungsi di dashboard |

**Langkah-langkah:**

1. Buka halaman `/dashboard`
2. Cari tombol toggle **Dark Mode** (biasanya ikon bulan/matahari)
3. Klik toggle untuk mengaktifkan mode gelap
4. Perhatikan seluruh elemen di halaman

**Hasil yang Diharapkan:**

- Latar belakang berubah jadi **gelap/hitam**
- Teks tetap **terbaca jelas** (warna terang di atas latar gelap)
- Grafik/chart tetap terlihat dengan baik
- Tidak ada teks yang "hilang" karena warna sama dengan latar
- Klik toggle lagi → kembali ke mode terang

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-008: Grafik/Chart Tampil dengan Benar

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-008 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan grafik-grafik analitik tampil dan bisa diinteraksi |

**Langkah-langkah:**

1. Buka halaman dashboard analitik (jika ada sub-tab atau bagian chart)
2. Perhatikan grafik yang tampil (bar chart, line chart, pie chart)
3. Arahkan kursor (hover) ke salah satu bagian grafik
4. Perhatikan apakah muncul **tooltip** (pop-up info kecil)

**Hasil yang Diharapkan:**

- Grafik tampil tanpa error atau loading tak berakhir
- Hover menunjukkan **tooltip** dengan detail angka
- Data di grafik sesuai dengan data aktual
- Legenda (keterangan warna) terlihat jelas

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-009: Navigasi Sidebar/Menu

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-009 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan semua menu navigasi berfungsi |

**Langkah-langkah:**

1. Dari halaman dashboard, klik setiap item di sidebar/menu navigasi:
   - Dashboard
   - Produk
   - BOM
   - Mesin
   - Settings
2. Catat apakah setiap klik membuka halaman yang benar

**Hasil yang Diharapkan:**

- Setiap menu **membuka halaman yang sesuai**
- Menu yang sedang aktif ditandai (highlight/warna berbeda)
- Navigasi **tidak ada yang rusak** (semua link berfungsi)
- Halaman berpindah dengan cepat tanpa loading lama

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-010: Data Real-Time / Refresh

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-010 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan dashboard menampilkan data terbaru |

**Langkah-langkah:**

1. Buka halaman `/dashboard` — catat angka Total Stok
2. **Buka tab/window baru** dan lakukan stock adjustment (tambah stok)
3. Kembali ke tab dashboard
4. Refresh halaman (tekan F5 atau Ctrl+R)
5. Periksa apakah angka Total Stok sudah berubah

**Hasil yang Diharapkan:**

- Setelah refresh, angka **Total Stok sudah terupdate** sesuai perubahan
- Tidak perlu logout-login ulang untuk melihat data terbaru

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-011: Dashboard Finance Role

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-011 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan user FINANCE bisa akses dashboard dan finance module |

**Langkah-langkah:**

1. Login sebagai user dengan role **FINANCE**
2. Buka `/dashboard` — pastikan bisa diakses
3. Buka `/finance` — pastikan bisa diakses
4. Coba akses `/warehouse` — catat hasilnya
5. Coba akses `/production` — catat hasilnya

**Hasil yang Diharapkan:**

- Dashboard dan Finance module **bisa diakses**
- Warehouse dan Production **tidak bisa diakses** (redirect ke dashboard)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-DASH-012: Responsif di Layar Kecil

| Field | Detail |
|-------|--------|
| **ID** | TC-DASH-012 |
| **Prioritas** | 🟢 P3 — Pelengkap |
| **Tujuan** | Memastikan dashboard tampil baik di layar kecil/tablet |

**Langkah-langkah:**

1. Buka `/dashboard` di browser desktop
2. Perkecil jendela browser hingga lebar ~768px (ukuran tablet)
3. Perhatikan tata letak kartu KPI dan grafik
4. Perkecil lagi hingga ~375px (ukuran HP)
5. Perhatikan apakah semua konten masih terbaca

**Hasil yang Diharapkan:**

- Kartu KPI **menyesuaikan** ke layout vertikal (stack) di layar kecil
- Tidak ada teks yang terpotong atau keluar layar
- Navigasi/sidebar berubah jadi hamburger menu di mobile
- Semua elemen tetap bisa diakses

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

## Ringkasan Hasil

| Total TC | Lulus | Gagal | Sebagian |
|----------|-------|-------|----------|
| 12 | _____ | _____ | _____ |

**Catatan Umum:**

_______________________________________________

**Tanda Tangan Tester:** _________________________

**Tanggal:** ____/____/________
