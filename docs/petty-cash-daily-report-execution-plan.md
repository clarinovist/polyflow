# Rencana Eksekusi — Daily Petty Cash Report

Tanggal: 2026-06-09  
Status: Draft eksekusi  
Area: Finance / Petty Cash

## 1. Latar Belakang

Dalam workflow finance pabrik, kas kecil biasanya ditutup dan dilaporkan setiap hari. Laporan ini berisi ringkasan transaksi petty cash harian dan ditandatangani oleh pihak terkait, umumnya:

- Finance / kasir / pembuat laporan
- Direktur / approver operasional
- Komisaris / pihak mengetahui atau pengawas

Di PolyFlow saat ini sudah ada modul petty cash dasar:

- Halaman: `/finance/petty-cash`
- Model: `PettyCashTransaction`
- Service: `src/services/finance/petty-cash-service.ts`
- Actions: `src/actions/finance/petty-cash-actions.ts`

Namun fitur yang tersedia masih berfokus pada pencatatan transaksi petty cash, approval voucher, replenishment, dan posting jurnal. Belum ada workflow laporan petty cash harian yang bisa dicetak, ditutup, dan ditandatangani.

## 2. Tujuan

Menambahkan fitur **Daily Petty Cash Report** agar finance dapat:

1. Membuat laporan petty cash per tanggal.
2. Melihat saldo awal, kas masuk, kas keluar, dan saldo akhir.
3. Melihat daftar voucher petty cash pada tanggal tersebut.
4. Mencetak laporan dengan area tanda tangan Finance, Direktur, dan Komisaris.
5. Menyimpan status laporan harian untuk kebutuhan kontrol internal.
6. Mengunci transaksi harian setelah laporan dinyatakan final pada phase lanjutan.

## 3. Scope Implementasi

### 3.1 In Scope

- Halaman laporan petty cash harian.
- Filter tanggal laporan.
- Ringkasan saldo:
  - Saldo awal
  - Total replenishment / cash in
  - Total expense / cash out
  - Saldo akhir
- Tabel transaksi harian:
  - Tanggal
  - Nomor voucher
  - Jenis transaksi
  - Deskripsi
  - Akun biaya
  - Nilai masuk
  - Nilai keluar
  - Status
- Area tanda tangan:
  - Dibuat oleh Finance
  - Disetujui Direktur
  - Mengetahui Komisaris
- Mode print-friendly.
- Export/print via browser print sebagai MVP.
- Dokumentasi UAT/test case.

### 3.2 Out of Scope untuk MVP

- Digital signature cryptographic/legal-grade.
- Upload gambar tanda tangan.
- Approval bertingkat realtime dengan notifikasi.
- Integrasi e-meterai.
- Mobile signature flow.

Fitur di atas bisa masuk phase lanjutan setelah MVP stabil.

## 4. Rekomendasi Phase

## Phase 1 — Printable Daily Report

Tujuan: memenuhi kebutuhan operasional paling cepat tanpa risiko besar ke data finance.

### Fitur

- Tambah halaman:
  - `/finance/petty-cash/reports/daily`
- Tambah menu/sidebar finance:
  - `Petty Cash Daily Report`
- Tambah action/service read-only:
  - mengambil transaksi petty cash per tanggal
  - menghitung saldo awal sebelum tanggal laporan
  - menghitung total masuk/keluar tanggal laporan
  - menghitung saldo akhir
- Tambah UI report dengan layout print-friendly.
- Tambah tombol `Print`.
- Signature box kosong untuk tanda tangan manual.

### Catatan Teknis

Phase ini sebaiknya **read-only** terhadap ledger dan transaksi. Tidak perlu migration DB dulu jika hanya menampilkan laporan dan print.

### Acceptance Criteria

- User finance dapat membuka laporan petty cash per tanggal.
- Laporan menampilkan transaksi tanggal tersebut dengan benar.
- Saldo awal dan saldo akhir sesuai jurnal petty cash.
- Laporan bisa dicetak dan area tanda tangan tampil rapi.
- Tidak ada perubahan data ketika hanya membuka/print report.

---

## Phase 2 — Simpan Daily Report & Kontrol Tanda Tangan Basah

Tujuan: mulai membentuk kontrol internal dan audit trail tanpa memaksa Direktur/Komisaris login untuk approval digital. Dokumen tetap dicetak dan ditandatangani basah sesuai praktik operasional.

### Fitur

- Tambah model baru: `PettyCashDailyReport`.
- Simpan laporan harian per tanggal.
- Status laporan:
  - `DRAFT`
  - `READY_TO_PRINT`
  - `SIGNED_PHYSICAL`
  - `FINALIZED`
  - `VOIDED`
- Simpan user dan timestamp untuk kontrol finance:
  - siapa membuat laporan
  - siapa menandai siap cetak
  - siapa mengonfirmasi tanda tangan basah sudah lengkap
  - siapa finalisasi arsip
- Tambah tombol:
  - `Create Report`
  - `Mark Ready to Print`
  - `Confirm Physical Signature`
  - `Finalize Archive`
  - `Void`

### Catatan Role dan Tanda Tangan

Untuk MVP, approval digital Direktur/Komisaris **tidak dibuat**. Direktur dan Komisaris tetap menandatangani dokumen fisik hasil print. PolyFlow hanya mencatat bahwa finance sudah:

- membuat laporan,
- mencetak laporan,
- menerima/mengarsipkan dokumen yang sudah ditandatangani basah,
- melakukan finalisasi arsip.

Jika nanti dibutuhkan, phase lanjutan bisa menambah upload scan/PDF bertanda tangan melalui field seperti `signedDocumentUrl`.

### Acceptance Criteria

- Laporan harian bisa disimpan satu kali per tanggal.
- Ada histori status dan timestamp kontrol finance.
- User bisa melihat siapa yang membuat, menandai siap cetak, mengonfirmasi tanda tangan basah, dan finalisasi laporan.
- Laporan finalized tidak bisa diedit langsung.

---

## Phase 3 — Closing, Locking, dan Adjustment

Tujuan: membuat kontrol kas kecil lebih aman.

### Fitur

- Setelah report finalized, transaksi petty cash pada tanggal tersebut terkunci.
- Perubahan setelah closing harus melalui adjustment/reversal, bukan edit langsung.
- Tambah warning jika user membuat transaksi backdate pada tanggal yang sudah closed.
- Tambah audit log untuk void/finalize/adjustment.

### Acceptance Criteria

- Tidak bisa approve/post transaksi petty cash ke tanggal yang sudah finalized tanpa mekanisme adjustment.
- Audit trail mencatat perubahan penting.
- Finance dapat melihat daftar report yang sudah closed/finalized.

## 5. Desain Data yang Disarankan

### 5.1 Model Baru: `PettyCashDailyReport`

Contoh konsep schema:

```prisma
model PettyCashDailyReport {
  id                         String   @id @default(uuid())
  reportDate                 DateTime @unique
  reportNumber               String   @unique

  openingBalance             Decimal  @db.Decimal(15, 2)
  totalIn                    Decimal  @db.Decimal(15, 2)
  totalOut                   Decimal  @db.Decimal(15, 2)
  closingBalance             Decimal  @db.Decimal(15, 2)

  status                     String   @default("DRAFT")
  notes                      String?
  signedDocumentUrl          String?

  createdById                String
  readyToPrintById           String?
  physicalSignedConfirmedById String?
  finalizedById              String?

  readyToPrintAt             DateTime?
  physicalSignedConfirmedAt  DateTime?
  finalizedAt                DateTime?

  createdAt                  DateTime @default(now())
  updatedAt                  DateTime @updatedAt

  createdBy                  User     @relation("PettyCashReportCreator", fields: [createdById], references: [id])

  @@index([reportDate])
  @@index([status, reportDate])
}
```

Catatan: relation tambahan ke `User` untuk approver bisa ditambahkan dengan relation name masing-masing jika phase 2 dieksekusi.

### 5.2 Model Existing yang Terdampak

`PettyCashTransaction` sebaiknya tetap menjadi sumber transaksi utama. Untuk phase 2/3 bisa ditambahkan field optional:

```prisma
pettyCashDailyReportId String?
```

Namun untuk MVP phase 1, field ini belum wajib.

## 6. Service/API yang Disarankan

### 6.1 Read-only Report Service

File baru yang disarankan:

- `src/services/finance/petty-cash-report-service.ts`

Fungsi:

- `getDailyPettyCashReport(date: Date)`
- `calculateOpeningBalance(date: Date)`
- `calculateDailyTotals(date: Date)`
- `getDailyTransactions(date: Date)`

### 6.2 Server Actions

File yang disarankan:

- `src/actions/finance/petty-cash-report-actions.ts`

Actions MVP:

- `getDailyPettyCashReportAction(date: string)`

Actions phase 2:

- `createPettyCashDailyReport(date: string)`
- `markPettyCashDailyReportReadyToPrint(id: string)`
- `confirmPettyCashDailyReportPhysicalSignature(id: string)`
- `finalizePettyCashDailyReport(id: string)`
- `voidPettyCashDailyReport(id: string)`

## 7. UI yang Disarankan

### 7.1 Route

- `/finance/petty-cash/reports/daily`

### 7.2 Struktur Tampilan

1. Header laporan:
   - Nama perusahaan/tenant
   - Judul: `Laporan Kas Kecil Harian`
   - Tanggal laporan
   - Nomor laporan jika phase 2

2. Summary cards:
   - Saldo awal
   - Total kas masuk
   - Total kas keluar
   - Saldo akhir

3. Tabel transaksi:
   - Voucher
   - Deskripsi
   - Akun
   - Masuk
   - Keluar
   - Status

4. Signature section:

```text
Dibuat oleh,              Disetujui oleh,              Mengetahui,
Finance                  Direktur                     Komisaris


(______________)         (______________)              (______________)
Tanggal: ____            Tanggal: ____                 Tanggal: ____
```

5. Tombol aksi:
   - Refresh
   - Print
   - Create/Submit/Approve jika phase 2

## 8. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Perhitungan saldo tidak sama dengan ledger | Laporan salah | Gunakan jurnal posted sebagai basis saldo; validasi dengan balance petty cash existing |
| Status petty cash existing belum konsisten | Approval/report membingungkan | Rapikan status sebelum phase 2 |
| Role Direktur/Komisaris belum ada | Approval tidak presisi | MVP pakai signature box manual; role baru masuk phase lanjutan |
| Locking transaksi mengganggu operasional | User tidak bisa koreksi | Terapkan locking hanya setelah approval final dan sediakan adjustment |
| Migration finance berisiko | Data production sensitif | Phase 1 tanpa migration; phase 2 wajib backup dan migration review |

## 9. UAT Checklist

### Phase 1

- [ ] Finance membuka halaman daily report.
- [ ] Finance memilih tanggal laporan.
- [ ] Sistem menampilkan saldo awal dengan benar.
- [ ] Sistem menampilkan seluruh transaksi petty cash tanggal tersebut.
- [ ] Sistem menghitung total kas masuk dan kas keluar dengan benar.
- [ ] Sistem menghitung saldo akhir dengan benar.
- [ ] Laporan dapat dicetak dengan layout rapi.
- [ ] Area tanda tangan Finance, Direktur, dan Komisaris tampil di hasil print.

### Phase 2

- [ ] Finance dapat membuat report untuk satu tanggal.
- [ ] Sistem mencegah duplicate report pada tanggal yang sama.
- [ ] Finance dapat menandai report siap cetak.
- [ ] Finance dapat mengonfirmasi dokumen fisik sudah ditandatangani basah.
- [ ] Timestamp dan user kontrol finance tersimpan.
- [ ] Status report berubah sesuai workflow.

### Phase 3

- [ ] Transaksi pada tanggal finalized tidak bisa diubah langsung.
- [ ] Backdate transaction ke tanggal closed ditolak atau diberi warning sesuai policy.
- [ ] Adjustment/reversal tercatat dengan audit trail.

## 10. Rekomendasi Eksekusi

Rekomendasi urutan implementasi:

1. Implementasi Phase 1 terlebih dahulu karena low-risk dan langsung berguna.
2. Validasi perhitungan saldo dengan data existing.
3. Review status petty cash existing (`DRAFT`, `APPROVED`, `POSTED`, `REPLENISHED`) agar konsisten.
4. Setelah user nyaman dengan format laporan print, lanjut Phase 2 untuk penyimpanan dan approval tracking.
5. Terapkan Phase 3 hanya setelah approval flow benar-benar stabil.

## 11. Definisi Selesai untuk MVP

MVP dianggap selesai jika:

- Halaman daily petty cash report tersedia.
- Laporan bisa difilter per tanggal.
- Saldo awal, kas masuk, kas keluar, dan saldo akhir tampil benar.
- Daftar transaksi harian tampil lengkap.
- Laporan bisa diprint dengan area tanda tangan Finance, Direktur, dan Komisaris.
- Tidak ada migration atau perubahan data risky di phase awal.
- Lint/typecheck untuk area yang disentuh lolos atau failure terdokumentasi jelas.
