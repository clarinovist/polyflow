# ⚙️ UAT — Admin & Pengaturan Sistem

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Super Admin, Multi-Tenant, User Management, Workspace Settings |
| **Halaman** | `/admin`, `/admin/super-admin`, `/dashboard/settings` |
| **Login Sebagai** | SUPER ADMIN dan ADMIN |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Akun Super Admin tersedia
- Akun Admin (tenant) tersedia
- Minimal 2 tenant/workspace aktif

---

## A. Super Admin

### TC-SA-001: Login Super Admin
| **ID** | TC-SA-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Login dengan akun Super Admin

**Diharapkan:** Redirect ke `/admin/super-admin`, halaman admin menampilkan daftar tenant

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SA-002: Lihat Daftar Tenant
| **ID** | TC-SA-002 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Di halaman Super Admin → periksa daftar tenant/workspace

**Diharapkan:** Semua tenant terlihat dengan nama, jumlah user, tanggal dibuat, status

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SA-003: Buat Tenant Baru
| **ID** | TC-SA-003 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Klik Buat Tenant → isi nama, slug → Simpan

**Diharapkan:** Tenant baru dibuat, muncul di daftar, default data (CoA, lokasi gudang) otomatis ter-generate

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SA-004: Isolasi Data Antar Tenant
| **ID** | TC-SA-004 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** 
1. Login sebagai Admin tenant A → catat produk yang ada
2. Logout → Login sebagai Admin tenant B → periksa produk

**Diharapkan:** Produk tenant A TIDAK terlihat di tenant B, data sepenuhnya terpisah

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## B. User & Workspace Management

### TC-USR-001: Tambah User ke Workspace
| **ID** | TC-USR-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Login sebagai ADMIN → Settings → Users → Tambah User → isi email, nama, role → Simpan

**Diharapkan:** User baru terdaftar di workspace, bisa login dengan role yang ditentukan

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-USR-002: Ubah Role User
| **ID** | TC-USR-002 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Edit user → ubah role dari SALES ke FINANCE → Simpan → logout & login ulang dgn user tsb

**Diharapkan:** Setelah login ulang, akses berubah sesuai role baru

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-USR-003: Nonaktifkan User
| **ID** | TC-USR-003 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Edit user → nonaktifkan/disable → coba login dengan user tersebut

**Diharapkan:** Login DITOLAK, pesan "Akun tidak aktif"

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SET-001: Pengaturan Workspace (Nama, Logo)
| **ID** | TC-SET-001 | **Prioritas** | 🟢 P3 |
|--------|-----------|---------------|--------|

**Langkah:** Settings → Workspace → ubah nama perusahaan, upload logo → Simpan

**Diharapkan:** Nama & logo terupdate, terlihat di header/sidebar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-SET-002: Manajemen Lokasi Gudang
| **ID** | TC-SET-002 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Settings → Locations → tambah lokasi baru "QC Area" → Simpan

**Diharapkan:** Lokasi baru muncul di dropdown transfer stok, inventori, dan PO

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Bagian | TC | Lulus | Gagal | Sebagian |
|--------|-----|-------|-------|----------|
| Super Admin | 4 | | | |
| User & Settings | 5 | | | |
| **TOTAL** | **9** | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
