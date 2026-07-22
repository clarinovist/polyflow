# Panduan Fitur: Produksi Hari Ini

**Polyflow v1.8.0**
Tanggal: 23 Juni 2026

---

## Apa Ini?

Fitur **Produksi Hari Ini** memungkinkan supervisor membuat order produksi harian dengan satu klik, tanpa harus melalui proses Job Order yang panjang.

**Sebelumnya:** Buat WO → Release → Assign Mesin → Operator Pilih Order → Produksi (5 langkah)

**Sekarang:** Pilih Produk + Qty + Mesin → Produksi (1 langkah)

---

## Siapa yang Pakai?

| Role                             | Kebutuhan                                            |
| -------------------------------- | ---------------------------------------------------- |
| **Supervisor / Kepala Produksi** | Membuat rencana produksi harian di pagi hari         |
| **Operator**                     | Tetap pakai Kiosk seperti biasa untuk catat output   |
| **Finance**                      | Tidak perlu apa-apa — journal entries jalan otomatis |

---

## Cara Mengakses

1. Login ke Polyflow
2. Buka portal **Produksi** → home **Papan Produksi** (`/production`) = pulse + antrean shift
3. Klik **SPK Aktif** di sidebar (group Lantai) — dulu “Produksi Hari Ini / Produksi Aktif”

Atau langsung buka: `/production/daily`

---

## Langkah 1: Buka Halaman Produksi Hari Ini

Halaman ini menampilkan semua produk yang hari ini sedang atau siap diproduksi.

**Komponen halaman:**

- **Kartu Statistik** di bagian atas:
  - Total Produk — berapa produk yang hari ini direncanakan
  - Sedang Jalan — produk yang sedang diproduksi
  - Siap Produksi — produk yang sudah dibuat ordernya, menunggu operator
  - Tunggu Bahan — produk yang stok bahan bakunya kurang

- **Daftar Produksi** — kartu per produk yang sedang aktif

---

## Langkah 2: Tambah Produk Baru

Klik tombol **"+ Tambah Produk"** di pojok kanan atas.

Dialog muncul dengan 3 field:

### Produk

Dropdown menampilkan semua produk yang punya BOM (Bill of Materials / resep) default. Pilih produk yang mau diproduksi.

> **Catatan:** Kalau produk tidak muncul di dropdown, artinya belum ada BOM default. Buat BOM dulu di menu **Master Data → BOM / Formula**.

### Jumlah

Masukkan target produksi dalam unit base (biasanya kg). Contoh: `500`

### Mesin

Dropdown mesin otomatis menyesuaikan dengan tahap produksi:

| Tahap BOM | Mesin yang Tersedia |
| --------- | ------------------- |
| MIXING    | Mixer               |
| EXTRUSION | Extruder, Rewinder  |
| PACKING   | Packer, Granulator  |
| REWORK    | Semua mesin         |
| STANDARD  | Extruder, Mixer     |

Klik tombol **"Produksi"** untuk membuat order.

---

## Langkah 3: Monitor Progress

Setelah order dibuat, kartu produk muncul di dashboard dengan informasi:

- **Nama produk** dan tahap produksi
- **Mesin** yang digunakan
- **Progress bar** — persentase output vs target
- **Statistik eksekusi** — berapa kali produksi, total output, total scrap

**Status yang mungkin:**

| Status        | Arti                                  | Warna |
| ------------- | ------------------------------------- | ----- |
| Siap Produksi | Order sudah dibuat, menunggu operator | Hijau |
| Sedang Jalan  | Operator sudah mulai catat output     | Biru  |
| Tunggu Bahan  | Stok bahan baku kurang                | Merah |

---

## Langkah 4: Operator Produksi di Kiosk

Operator tidak perlu tahu soal halaman ini. Mereka tetap pakai **Kiosk** seperti biasa:

1. Buka Kiosk (`/kiosk`)
2. Pilih mesin (contoh: HD)
3. Order yang baru dibuat sudah muncul di list
4. Klik order → catat output (bruto, scrap, shift, dll)
5. Simpan

**Yang terjadi otomatis di belakang:**

- Bahan baku berkurang dari stok (backflush)
- Journal entry dibuat:
  - Debit: Work in Progress (WIP)
  - Kredit: Inventori Bahan Baku
- Finished goods bertambah:
  - Debit: Inventori Barang Jadi
  - Kredit: WIP
- Scrap tercatat:
  - Debit: Inventori Scrap
  - Kredit: WIP

Supervisor tidak perlu input apapun terkait accounting.

---

## Langkah 5: Lihat Detail Order

Klik tombol **"Detail"** pada kartu produk untuk melihat halaman lengkap:

- Material yang sudah dikonsumsi
- Semua riwayat eksekusi
- Perhitungan cost (COGM)
- Shift dan operator yang terlibat

Atau klik tombol **"Kiosk"** untuk langsung buka halaman Kiosk.

---

## Langkah 6: Produksi Besok

Besok pagi, buka lagi halaman **Produksi Hari Ini**:

- Order yang sudah COMPLETED tidak muncul lagi
- Order yang masih IN_PROGRESS (belum capai target) tetap muncul
- Tambah produk baru seperti biasa

---

## Pertanyaan Umum

### Bagaimana kalau stok bahan kurang?

Sistem otomatis set status ke **Tunggu Bahan**. Kartu produk berwarna merah. Supervisor bisa:

- Tunggu sampai stok tersedia (setelah pembelian masuk)
- Kurangi target produksi

### Bagaimana kalau produksi belum selesai hari ini?

Order tetap ada di status IN_PROGRESS. Besok, buka halaman yang sama — order masih muncul. Lanjut produksi seperti biasa.

### Bagaimana kalau mau batalkan sisa target?

Buka halaman detail order → klik tombol **"Tutup Order"**. Order jadi COMPLETED walau belum capai target.

### Bagaimana dengan order dari customer (MTO)?

Tetap pakai flow lama: **Planning Portal → SPK Produksi → Buat WO**. Fitur Produksi Hari Ini untuk produksi internal/stock-building, bukan MTO.

### Apakah journal entries tetap jalan?

Ya. Semua accounting otomatis:

- Backflush material → Dr. WIP / Cr. Inventori Bahan
- Output produksi → Dr. Inventori Jadi / Cr. WIP
- Scrap → Dr. Inventori Scrap / Cr. WIP
- COGM dihitung dari total material cost + conversion cost

### Bisa pakai untuk Maklon?

Tidak. Maklon tetap pakai flow lama di Planning Portal karena ada cost items khusus dan treatment akuntansi yang berbeda (off-balance sheet).

---

## Tips

1. **Cek stok dulu** sebelum tambah produk — kalau stok kurang, order langsung masuk status Tunggu Bahan
2. **Satu produk per kartu** — kalau hari ini mau produksi 3 jenis, tambah 3 kali
3. **Klik Kiosk** untuk langsung ke halaman operator tanpa navigasi manual
4. **Progress bar** update real-time setelah operator catat output

---

## Kontak

Ada pertanyaan atau masalah? Hubungi tim IT atau admin sistem Polyflow.
