# 📊 UAT — Modul Keuangan & Akuntansi (Papan Keuangan v2)

## Informasi Modul

| Field | Detail |
|-------|--------|
| **Modul** | Papan Keuangan, COA, Jurnal, AR/AP, Petty Cash, Rekon Bank, Laporan (hub) |
| **Halaman** | `/finance` (Papan Keuangan), `/finance/coa`, `/finance/journals`, `/finance/invoices/*`, `/finance/payments/*`, `/finance/aging`, `/finance/bank-reconciliation`, `/finance/reports` (hub), `/finance/periods` |
| **Login Sebagai** | ADMIN atau FINANCE |
| **Tanggal UAT** | ____/____/________ |
| **Nama Tester** | _________________________ |
| **IA baru** | Sidebar: Hari Ini (Papan Keuangan) · Operasi Kas (Petty + Rekon + Aging) · Piutang & Hutang (Quick entry, AR, terima, AP, bayar) · Akuntansi (Jurnal, Aset, FOH) · Anggaran (1 entry hub → input/variance) · Laporan (1 hub `/finance/reports` → 8 reports) · Pengaturan (COA + roles, periode, saldo awal, bank pembayaran) |

## 0. Papan Keuangan — Command Board (NEW)

### TC-FIN-HOME-001: Board queues + snapshot dual section
| **ID** | TC-FIN-HOME-001 | **Prioritas** | 🔴 P1 |

**Langkah:** Buka `/finance` → periksa antrean kerja (snapshot, bukan filter periode) + snapshot periode (filter bulan).

**Diharapkan:**
- Top 4 queue cards: Piutang jatuh tempo (N / Rp sisa), Hutang jatuh tempo, Jurnal draft, Rekonsiliasi terbuka. Angka = snapshot global, bukan filter periode.
- Filter bulan (FinanceDateFilter) hanya mempengaruhi strip snapshot GL di bawah: Pendapatan (4*), Posisi kas (111*), AR GL (112*), AP GL (211*) — semua POSTED only.
- Tooltip definisi GL vs invoice remaining jelas.

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-FIN-HOME-002: Posisi kas label jujur
| **ID** | TC-FIN-HOME-002 | **Prioritas** | 🔴 P1 |

**Langkah:** `/finance` → cek card Posisi kas.

**Diharapkan:** Label **Posisi kas (akun 111\*)** + tooltip GL akun 111* POSTED filter periode. Tidak lagi copy menyesatkan "Revenue − Payables" / "Net Position".

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-FIN-HOME-003: AR overdue deep link
| **ID** | TC-FIN-HOME-003 | **Prioritas** | 🔴 P1 |

**Langkah:** Klik card Piutang jatuh tempo atau list top 5 → lanjutkan `/finance/invoices/sales?status=OVERDUE`.

**Diharapkan:** List invoice sales overdue filter hidup (dueDate < now, sisa > 0). Klik detail → bisa input pembayaran di `/finance/payments/received`.

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-FIN-HOME-004: AP overdue deep link
| **ID** | TC-FIN-HOME-004 | **Prioritas** | 🔴 P1 |

**Langkah:** Card Hutang jatuh tempo → `/finance/invoices/purchase?status=OVERDUE`.

**Diharapkan:** List hutang overdue, supplier name jelas, bisa lanjut bayar `/finance/payments/sent`.

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-FIN-HOME-005: Quick actions ID
| **ID** | TC-FIN-HOME-005 | **Prioritas** | 🟡 P2 |

**Langkah:** Bar Cepat (Terima bayar, Bayar supplier, Petty cash, Jurnal baru, Aging, Rekonsiliasi, Laporan).

**Diharapkan:** Semua link live, label Bahasa Indonesia.

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-FIN-NAV-001: IA collapse sidebar
| **ID** | TC-FIN-NAV-001 | **Prioritas** | 🔴 P1 |

**Langkah:** Periksa sidebar finance: top-level ≤ ~15 (target). Laporan = 1 entry hub `/finance/reports` (bukan 8 flat). Anggaran = 1 entry hub nested input/variance. Pengaturan mencakup Bank Pembayaran `/finance/payment-banks`.

**Diharapkan:** Navigasi ringan; report cards di `/finance/reports` hub lengkap 8 reports + variance. Permission granular masih work: user dengan hak `/finance/reports/income-statement` saja masih bisa akses via hub atau direct URL walaupun sidebar top-level hanya hub.

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-FIN-REP-001: Reports hub
| **ID** | TC-FIN-REP-001 | **Prioritas** | 🔴 P1 |

**Langkah:** `/finance/reports` → buka semua 8 cards: Neraca, Laba Rugi, Neraca Saldo, Buku Besar, Arus Kas, HPP, Pajak, Maklon + Varians Anggaran.

**Diharapkan:** Semua link hidup, deskripsi ID, catatan metrik anti-bingung (GL vs invoice).

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

---

### TC-FIN-PERIOD-001: Period close signal
| **ID** | TC-FIN-PERIOD-001 | **Prioritas** | 🟡 P2 |

**Langkah:** `/finance` strip periode: cek periode berjalan OPEN, days to month end, openCount. Klik Kelola periode → `/finance/periods`.

**Diharapkan:** Signal jelas tutup bulan; tidak crash bila tidak ada periode berjalan.

**Hasil:** ☐ Lulus / ☐ Gagal / ☐ Sebagian | **Catatan:** ___

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
