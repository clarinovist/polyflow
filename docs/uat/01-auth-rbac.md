# 🔐 UAT — Modul Login & Hak Akses (Auth & RBAC)

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Autentikasi & Role-Based Access Control |
| **Halaman Terkait** | `/login`, `/register`, `/logout`, `/admin-login` |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |
| **Versi Aplikasi** | _________________________ |

## Prasyarat

- Sudah ada minimal 1 akun untuk setiap role (ADMIN, WAREHOUSE, PRODUCTION, FINANCE, SALES, PPIC, PROCUREMENT)
- Sudah ada 1 akun Super Admin
- Browser dalam keadaan bersih (tidak ada session login sebelumnya)

---

## Test Cases

---

### TC-AUTH-001: Login dengan Akun yang Benar

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-001 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan pengguna bisa masuk ke aplikasi dengan email dan password yang benar |

**Langkah-langkah:**

1. Buka halaman utama aplikasi PolyFlow
2. Klik tombol **Login** atau langsung buka halaman `/login`
3. Masukkan **email** yang sudah terdaftar
4. Masukkan **password** yang benar
5. Pilih **role** yang sesuai (jika ada pilihan role)
6. Klik tombol **Masuk / Login**

**Hasil yang Diharapkan:**

- Pengguna berhasil masuk ke aplikasi
- Halaman berpindah ke dashboard sesuai role pengguna:
  - ADMIN → `/dashboard`
  - WAREHOUSE → `/warehouse`
  - PRODUCTION → `/production`
  - FINANCE/SALES/PPIC → `/dashboard`
- Nama pengguna terlihat di bagian atas/header aplikasi

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-002: Login dengan Password Salah

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-002 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan sistem menolak login jika password salah |

**Langkah-langkah:**

1. Buka halaman `/login`
2. Masukkan email yang sudah terdaftar
3. Masukkan **password yang salah**
4. Klik tombol **Masuk / Login**

**Hasil yang Diharapkan:**

- Login **ditolak** — tidak masuk ke dashboard
- Muncul pesan error yang jelas (contoh: "Email atau password salah")
- Password yang diketik **tidak terlihat** (tersembunyi/dots)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-003: Login dengan Email yang Tidak Terdaftar

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-003 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan sistem menolak login jika email tidak terdaftar |

**Langkah-langkah:**

1. Buka halaman `/login`
2. Masukkan email yang **belum pernah didaftarkan** (contoh: `tidak.ada@email.com`)
3. Masukkan password sembarang
4. Klik tombol **Masuk / Login**

**Hasil yang Diharapkan:**

- Login **ditolak**
- Muncul pesan error yang sesuai
- Sistem **tidak memberikan petunjuk** apakah email-nya yang salah atau password-nya (untuk keamanan)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-004: Login dengan Form Kosong

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-004 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan sistem tidak crash jika form login dikosongkan |

**Langkah-langkah:**

1. Buka halaman `/login`
2. **Jangan isi** email dan password
3. Klik tombol **Masuk / Login**

**Hasil yang Diharapkan:**

- Sistem **tidak crash** atau error
- Muncul pesan validasi (contoh: "Email wajib diisi", "Password wajib diisi")
- Tidak ada request yang dikirim ke server

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-005: Fitur Lihat/Sembunyikan Password

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-005 |
| **Prioritas** | 🟢 P3 — Pelengkap |
| **Tujuan** | Memastikan pengguna bisa melihat password yang diketik |

**Langkah-langkah:**

1. Buka halaman `/login`
2. Ketik password di kolom password
3. Klik ikon **mata** (👁️) di sebelah kanan kolom password

**Hasil yang Diharapkan:**

- Klik pertama: password **terlihat** (teks biasa)
- Klik kedua: password **tersembunyi** kembali (dots/bullets)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-006: Fitur "Ingat Saya" (Remember Me)

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-006 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan sesi login bertahan lebih lama jika "Ingat Saya" dicentang |

**Langkah-langkah:**

1. Buka halaman `/login`
2. Masukkan email dan password yang benar
3. **Centang** opsi "Ingat Saya" / "Remember Me"
4. Klik **Masuk**
5. Tutup browser sepenuhnya
6. Buka kembali browser dan akses PolyFlow

**Hasil yang Diharapkan:**

- Pengguna **tetap login** tanpa perlu memasukkan ulang email/password
- Sesi bertahan hingga 30 hari (selama centang "Ingat Saya" aktif)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-007: Auto-Logout Setelah Tidak Aktif (Tanpa Remember Me)

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-007 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan sesi habis otomatis setelah 2 jam tidak aktif |

**Langkah-langkah:**

1. Login **tanpa** mencentang "Ingat Saya"
2. Biarkan aplikasi terbuka **tanpa aktivitas apapun** selama lebih dari 2 jam
3. Coba klik salah satu menu atau tombol

**Hasil yang Diharapkan:**

- Pengguna **otomatis keluar** (redirect ke halaman login)
- Muncul notifikasi bahwa sesi telah berakhir

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-008: Logout Manual

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-008 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan pengguna bisa keluar dari aplikasi |

**Langkah-langkah:**

1. Login ke aplikasi
2. Klik nama pengguna atau ikon profil di bagian atas
3. Pilih **Logout** / **Keluar**

**Hasil yang Diharapkan:**

- Pengguna keluar dari aplikasi
- Halaman berpindah ke halaman login
- Jika coba akses `/dashboard` langsung, akan diarahkan kembali ke `/login`

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-009: Akses Halaman ADMIN oleh Role WAREHOUSE

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-009 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan user dengan role WAREHOUSE tidak bisa mengakses halaman lain |

**Langkah-langkah:**

1. Login dengan akun yang memiliki role **WAREHOUSE**
2. Setelah masuk, coba ketik manual di address bar: `/dashboard`
3. Coba juga ketik: `/production`
4. Coba juga ketik: `/finance`
5. Coba juga ketik: `/sales`

**Hasil yang Diharapkan:**

- Semua percobaan di atas **otomatis dialihkan (redirect)** ke `/warehouse`
- User WAREHOUSE hanya bisa mengakses halaman-halaman di bawah `/warehouse`
- Tidak muncul error 403 atau halaman kosong (langsung redirect saja)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-010: Akses Halaman oleh Role PRODUCTION

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-010 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan user PRODUCTION hanya bisa akses `/production` |

**Langkah-langkah:**

1. Login dengan akun role **PRODUCTION**
2. Coba ketik di address bar: `/dashboard`
3. Coba ketik: `/warehouse`
4. Coba ketik: `/finance`

**Hasil yang Diharapkan:**

- Semua percobaan di atas **dialihkan ke `/production`**
- Halaman produksi tampil normal dengan semua fiturnya

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-011: Akses Dashboard oleh Role ADMIN

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-011 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan user ADMIN bisa mengakses semua halaman |

**Langkah-langkah:**

1. Login dengan akun role **ADMIN** (bukan Super Admin)
2. Buka `/dashboard` → pastikan bisa diakses
3. Buka `/warehouse` → pastikan bisa diakses
4. Buka `/production` → pastikan bisa diakses
5. Buka `/finance` → pastikan bisa diakses
6. Buka `/sales` → pastikan bisa diakses
7. Buka `/planning` → pastikan bisa diakses

**Hasil yang Diharapkan:**

- **Semua halaman** bisa diakses tanpa error atau redirect
- Navigasi berfungsi normal di semua modul
- User ADMIN **tidak bisa** akses `/admin` (khusus Super Admin)

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-012: Super Admin — Isolasi ke /admin

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-012 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan Super Admin hanya bisa akses halaman `/admin` |

**Langkah-langkah:**

1. Login dengan akun **Super Admin** (via `/admin-login` atau `/login`)
2. Setelah login, coba akses `/dashboard`
3. Coba akses `/warehouse`
4. Coba akses `/production`

**Hasil yang Diharapkan:**

- Super Admin **otomatis dialihkan** ke `/admin/super-admin`
- Tidak bisa mengakses halaman tenant (dashboard, warehouse, dll)
- Halaman admin tampil dengan fitur pengelolaan tenant

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-013: Registrasi Pengguna Baru

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-013 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan proses pendaftaran akun baru berjalan |

**Langkah-langkah:**

1. Buka halaman `/register`
2. Isi formulir pendaftaran:
   - Nama lengkap
   - Email (gunakan email baru yang belum terdaftar)
   - Password (minimal sesuai persyaratan)
   - Konfirmasi password
3. Klik tombol **Daftar / Register**

**Hasil yang Diharapkan:**

- Akun berhasil dibuat
- Pengguna diarahkan ke halaman login atau langsung masuk
- Jika email sudah terdaftar, muncul pesan error yang jelas

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-014: Akses Halaman Tanpa Login

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-014 |
| **Prioritas** | 🔴 P1 — Kritis |
| **Tujuan** | Memastikan halaman yang dilindungi tidak bisa diakses tanpa login |

**Langkah-langkah:**

1. Pastikan **tidak sedang login** (logout dulu jika perlu)
2. Buka langsung URL:
   - `/dashboard`
   - `/warehouse`
   - `/production`
   - `/finance`
   - `/sales`
   - `/planning`
3. Catat apa yang terjadi di masing-masing URL

**Hasil yang Diharapkan:**

- **Semua URL di atas** otomatis dialihkan ke halaman `/login`
- Tidak ada data/informasi yang terlihat sebelum login
- Halaman publik (`/`, `/about`, `/features`, `/contact`) tetap bisa diakses

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

### TC-AUTH-015: Kiosk Bisa Diakses Tanpa Login

| Field | Detail |
|-------|--------|
| **ID** | TC-AUTH-015 |
| **Prioritas** | 🟡 P2 — Penting |
| **Tujuan** | Memastikan halaman Kiosk Operator bisa diakses tanpa login |

**Langkah-langkah:**

1. Pastikan **tidak sedang login**
2. Buka langsung URL: `/kiosk`

**Hasil yang Diharapkan:**

- Halaman Kiosk **terbuka tanpa perlu login**
- Muncul layar pemilihan operator
- Fitur kiosk berfungsi normal

**Hasil Aktual:** ☐ Lulus / ☐ Gagal / ☐ Sebagian

**Catatan:** _______________________________________________

---

## Ringkasan Hasil

| Total TC | Lulus | Gagal | Sebagian |
|----------|-------|-------|----------|
| 15 | _____ | _____ | _____ |

**Catatan Umum:**

_______________________________________________

_______________________________________________

**Tanda Tangan Tester:** _________________________

**Tanggal:** ____/____/________
