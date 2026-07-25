# 🖥️ UAT — Kiosk Operator Pabrik

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Kiosk touchscreen untuk operator mesin di lantai pabrik |
| **Halaman** | `/kiosk` |
| **Login Sebagai** | Tidak perlu login (kiosk terbuka) |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Sudah ada Production Order dengan status RELEASED
- Sudah ada data Operator/Karyawan
- Testing di layar sentuh (touchscreen) jika memungkinkan

---

### TC-KSK-001: Akses Kiosk Tanpa Login
| **ID** | TC-KSK-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Buka `/kiosk` tanpa login

**Diharapkan:** Halaman kiosk terbuka langsung tanpa halaman login, muncul layar utama kiosk

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-002: Pilih Operator
| **ID** | TC-KSK-002 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Di layar kiosk → pilih nama operator dari daftar atau scan badge

**Diharapkan:** Nama operator ditampilkan, daftar order yang di-assign ke operator/mesin muncul

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-003: Mulai Job (Start)
| **ID** | TC-KSK-003 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Pilih order RELEASED → klik START

**Diharapkan:** Status order → IN_PROGRESS, waktu mulai tercatat, timer berjalan di kiosk

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-004: Log Output dari Kiosk
| **ID** | TC-KSK-004 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Saat order IN_PROGRESS → klik Log Output → input:
- Good Output: 480 KG
- Scrap Prongkol: 10 KG
- Scrap Daun: 10 KG
- Shift: pilih dari dropdown
→ Submit

**Diharapkan:** Output tercatat dengan shift yang benar, stok barang jadi bertambah, stok scrap bertambah, backflush berjalan (bahan baku berkurang)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-004b: Log Output — Shift Wajib Dipilih
| **ID** | TC-KSK-004b | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Saat order IN_PROGRESS dengan shift terdaftar → klik Log Output
2. Isi qty tanpa memilih shift (biarkan default kosong jika memungkinkan)
3. Coba Submit

**Diharapkan:** Submit tertolak / tombol disabled sampai shift dipilih; muncul pesan "Shift wajib dipilih". Tidak ada execution tersimpan dengan shiftId kosong.

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-004c: Log Output — Semua Shift SPK Sudah Lewat
| **ID** | TC-KSK-004c | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Siapkan SPK dengan shift yang semuanya sudah lewat waktu (mis. shift terakhir berakhir jam 17:00, tes jalankan jam 20:00)
2. Buka job tersebut di kiosk (focus mode) → klik Log Output

**Diharapkan:**
- Muncul banner kuning "Semua shift untuk SPK ini sudah lewat"
- Dropdown shift tetap terisi (default: shift terakhir), operator masih bisa pilih manual
- Submit tetap berhasil dengan shift yang dipilih tersimpan benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-004d: Log Output — SPK Belum Punya Shift
| **ID** | TC-KSK-004d | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Siapkan SPK yang belum ada `ProductionShift` sama sekali
2. Buka job tersebut di kiosk → klik Log Output

**Diharapkan:** Muncul banner merah "Belum ada shift di SPK ini — tambah shift dulu di detail SPK atau hubungi PPIC". Operator diarahkan untuk hubungi Admin/PPIC, bukan submit dengan shift kosong.

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-005: Catat Downtime dari Kiosk
| **ID** | TC-KSK-005 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Klik tombol Downtime → pilih alasan (maintenance/trouble) → catat durasi → Submit

**Diharapkan:** Downtime tercatat, mesin ditandai downtime, total downtime terhitung

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-006: Selesaikan Job (Complete)
| **ID** | TC-KSK-006 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Klik COMPLETE pada order IN_PROGRESS

**Diharapkan:** Status → COMPLETED, waktu selesai tercatat, order hilang dari daftar aktif kiosk

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-007: Tampilan Kiosk Ramah Sentuh
| **ID** | TC-KSK-007 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Periksa ukuran tombol, teks, dan area input di kiosk

**Diharapkan:**
- Tombol berukuran besar dan mudah ditekan
- Font terbaca dari jarak 30cm
- Warna kontras tinggi (mudah dilihat di cahaya pabrik)
- Tidak ada elemen yang terlalu kecil untuk ditekan

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-008: Kiosk Tidak Bisa Akses Menu Admin
| **ID** | TC-KSK-008 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Dari kiosk → coba ketik `/dashboard`, `/admin` di address bar

**Diharapkan:** Tidak bisa mengakses halaman admin/dashboard karena tidak ada session login

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Phase 1 — Hub, Focus, Wizard

### TC-KSK-020: Hub Tiles Setelah Pilih Operator
| **ID** | TC-KSK-020 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Buka `/kiosk`
2. Pilih operator dari gate

**Diharapkan:**
- Hub menampilkan tile: Produksi/SPK, Absensi, Proses Khusus, Status Saya
- Badge count "N aktif" ditampilkan di tile Produksi jika ada job running
- Operator chip + tombol Logout ditampilkan

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-021: Start Job → Focus Mode
| **ID** | TC-KSK-021 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Dari hub → tap tile Produksi
2. Tap tombol MULAI SPK di salah satu card

**Diharapkan:**
- Setelah start, navigasi otomatis ke focus mode (`/kiosk/jobs/[orderId]`)
- Focus menampilkan: nama produk besar, mesin, operator, progress bar actual/target
- CTA: Catat Hasil (hijau besar), Downtime (outline), Stop (destructive)

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-022: Wizard Catat Hasil — Full Flow
| **ID** | TC-KSK-022 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Dari focus mode → tap "CATAT HASIL"
2. Step 1: Masukkan qty bagus → tap Lanjut
3. Step 2: Skip scrap (kosongkan) → tap Lanjut
4. Step 3: Skip foto → tap Lanjut
5. Step 4: Review ringkas → cek dropdown Shift terisi otomatis (atau ganti manual jika perlu) → tap "Kirim Hasil"

**Diharapkan:**
- Progress indicator 1/4 → 4/4
- Setiap step bisa back tanpa hilang data
- Step 4 menampilkan dropdown Shift (terisi otomatis berdasarkan operator/waktu aktif)
- Setelah sukses: layar "Berhasil!" dengan opsi "Catat Lagi" atau "Selesai"
- Actual quantity naik di focus mode

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-023: Banner Job Aktif → Focus
| **ID** | TC-KSK-023 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Pastikan ada job yang sedang running
2. Tap banner job aktif di bagian bawah layar

**Diharapkan:**
- Banner navigasi ke focus mode job yang benar (bukan daftar SPK)
- Timer elapsed ditampilkan dengan benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-024: HP — Alur Catat Hasil Tanpa Horizontal Scroll
| **ID** | TC-KSK-024 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Buka kiosk di HP (width < 768px)
2. Jalani alur: hub → produksi → pilih SPK → start → focus → catat hasil

**Diharapkan:**
- Hub tiles stack vertikal (1 kolom)
- Jobs list 1 kolom
- Focus full viewport
- Wizard tidak ada horizontal scroll destruktif
- Semua tombol tetap besar dan mudah ditekan

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-KSK-025: Idle Timeout
| **ID** | TC-KSK-025 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:**
1. Login operator di kiosk
2. Tidak melakukan aktivitas selama 15 menit

**Diharapkan:**
- 60 detik sebelum timeout: muncul warning "Session Hampir Habis"
- Warning menampilkan countdown
- Tap "Ketuk untuk Lanjut" → session lanjut
- Jika tidak diapa-apakan → logout otomatis → kembali ke gate operator

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Total TC | Lulus | Gagal | Sebagian |
|----------|-------|-------|----------|
| 17 | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
