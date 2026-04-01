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
→ Submit

**Diharapkan:** Output tercatat, stok barang jadi bertambah, stok scrap bertambah, backflush berjalan (bahan baku berkurang)

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

## Ringkasan Hasil

| Total TC | Lulus | Gagal | Sebagian |
|----------|-------|-------|----------|
| 8 | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
