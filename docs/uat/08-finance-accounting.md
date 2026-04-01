# 📊 UAT — Modul Keuangan & Akuntansi

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Chart of Accounts, Jurnal, AR/AP, Laporan Keuangan |
| **Halaman** | `/finance/accounts`, `/finance/journals`, `/finance/reports` |
| **Login Sebagai** | ADMIN atau FINANCE |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |

## Prasyarat
- Sudah ada Chart of Accounts (CoA) yang terisi
- Sudah ada transaksi (sales invoice/purchase invoice) untuk data jurnal
- Login sebagai FINANCE atau ADMIN

---

## A. Chart of Accounts (CoA)

### TC-COA-001: Lihat Daftar Akun
| **ID** | TC-COA-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Buka `/finance/accounts`

**Diharapkan:** Terlihat pohon akun: Aset, Kewajiban, Ekuitas, Pendapatan, Beban. Setiap akun punya kode, nama, tipe, saldo

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-COA-002: Buat Akun Baru
| **ID** | TC-COA-002 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Tambah akun → kode: 1150 → nama: "Kas Kecil Pabrik" → tipe: ASSET → Simpan

**Diharapkan:** Akun tersimpan, muncul di pohon akun di bawah kategori Aset

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-COA-003: Kode Akun Duplikat (Ditolak)
| **ID** | TC-COA-003 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Coba buat akun baru dengan kode yang sudah ada

**Diharapkan:** DITOLAK, pesan error "Kode akun sudah digunakan"

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## B. Jurnal Akuntansi

### TC-JRN-001: Buat Jurnal Manual
| **ID** | TC-JRN-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:**
1. `/finance/journals` → Buat Jurnal
2. Tanggal, deskripsi
3. Debit: Kas Rp 1.000.000
4. Kredit: Pendapatan Lain Rp 1.000.000
5. Simpan

**Diharapkan:** Jurnal tersimpan, total debit = total kredit, saldo akun terupdate

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-JRN-002: Jurnal Tidak Seimbang (Ditolak)
| **ID** | TC-JRN-002 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Buat jurnal: Debit Rp 1.000.000, Kredit Rp 900.000 → Simpan

**Diharapkan:** DITOLAK, pesan: "Total debit dan kredit harus sama"

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-JRN-003: Jurnal Otomatis dari Sales Payment
| **ID** | TC-JRN-003 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Catat pembayaran di Sales Invoice → buka journal entries

**Diharapkan:** Jurnal otomatis tercatat: Debit Kas/Bank, Kredit Piutang (AR), reference ke invoice

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-JRN-004: Jurnal Otomatis dari Purchase Payment
| **ID** | TC-JRN-004 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Catat pembayaran di Purchase Invoice → buka journal entries

**Diharapkan:** Jurnal otomatis: Debit Hutang (AP), Kredit Kas/Bank

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-JRN-005: Filter Jurnal
| **ID** | TC-JRN-005 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Filter jurnal berdasarkan tanggal, tipe (manual/otomatis), akun terkait

**Diharapkan:** Hanya jurnal yang sesuai filter yang tampil

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## C. Piutang & Hutang (AR/AP)

### TC-AR-001: Lihat Aging Piutang
| **ID** | TC-AR-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Buka laporan AR Aging

**Diharapkan:** Terlihat breakdown per customer: Current, 1-30 hari, 31-60 hari, 61-90 hari, >90 hari

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-AP-001: Lihat Aging Hutang
| **ID** | TC-AP-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Buka laporan AP Aging

**Diharapkan:** Terlihat breakdown per supplier: Current, 1-30 hari, 31-60 hari, 61-90 hari, >90 hari

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## D. Laporan Keuangan

### TC-RPT-001: Trial Balance
| **ID** | TC-RPT-001 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Buka `/finance/reports` → Trial Balance → pilih periode

**Diharapkan:** Semua akun tampil dengan saldo debit/kredit, total debit = total kredit

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-RPT-002: Laba Rugi (Income Statement)
| **ID** | TC-RPT-002 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Buka laporan Laba Rugi → pilih periode

**Diharapkan:** Pendapatan, HPP (COGM), Biaya Operasional, Laba Kotor, Laba Bersih tampil dengan benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-RPT-003: Neraca (Balance Sheet)
| **ID** | TC-RPT-003 | **Prioritas** | 🔴 P1 |
|--------|-----------|---------------|--------|

**Langkah:** Buka laporan Neraca → pilih tanggal

**Diharapkan:** Aset = Kewajiban + Ekuitas, semua akun terklasifikasi dengan benar

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-RPT-004: Export Laporan ke PDF/Excel
| **ID** | TC-RPT-004 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Buka laporan (Trial Balance/Laba Rugi/Neraca) → klik Export → pilih PDF atau Excel

**Diharapkan:** File terdownload, format rapi, data sesuai tampilan

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-RPT-005: Arus Kas (Cash Flow)
| **ID** | TC-RPT-005 | **Prioritas** | 🟡 P2 |
|--------|-----------|---------------|--------|

**Langkah:** Buka laporan Arus Kas → pilih periode

**Diharapkan:** Kas Masuk, Kas Keluar, dan Saldo Bersih per aktivitas (operasi, investasi, pendanaan) tampil

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

## Ringkasan Hasil

| Bagian | TC | Lulus | Gagal | Sebagian |
|--------|-----|-------|-------|----------|
| Chart of Accounts | 3 | | | |
| Jurnal | 5 | | | |
| AR/AP | 2 | | | |
| Laporan Keuangan | 5 | | | |
| **TOTAL** | **15** | | | |

**Tanda Tangan Tester:** _________________________ **Tanggal:** ____/____/________
