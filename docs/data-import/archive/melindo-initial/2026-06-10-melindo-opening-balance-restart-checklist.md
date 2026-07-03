# Melindo Opening Balance Restart Checklist

Tanggal: 2026-06-10
Target DB: `melindo_rafia`
Scope: persiapan sebelum mulai input opening balance lagi ke database

## 1. Status terbaru yang sudah diverifikasi

- Source Google Sheet `NERACA MEI` sekarang sudah balance
- `MIG-DIFF` suspense tidak diperlukan lagi
- `3-201b Laba Tahun Berjalan` terbaru = `172,978,343.45`
- `2-390 Hutang ke Nugroho Pramono` sudah dikonfirmasi user sebagai hutang pemilik yang valid atas nama Nugroho Pramono
- Draft journal-only sudah direfresh dan sudah berhasil diposting ke DB

## 2. File acuan yang harus dipakai

Wajib pakai file terbaru berikut:
- `docs/data-import/melindo-initial/melindo-opening-balance-final-staging.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-final-staging-summary.json`
- `docs/data-import/melindo-initial/melindo-opening-balance-journal_only.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-journal-lines.csv`
- `docs/data-import/melindo-initial/melindo-opening-balance-journal-lines-balanced-draft.csv`
- `docs/data-import/melindo-initial/sql/melindo-opening-balance-journal-draft-dry-run.sql`
- `docs/data-import/melindo-initial/sql/melindo-opening-balance-journal-draft.sql`

## 3. Preflight sebelum write ke DB

### A. Safety infra
- [ ] pastikan target tetap `melindo_rafia`, bukan `polyflow`
- [ ] cek container `polyflow-db` dan `polyflow-app` running
- [ ] ambil backup fresh sebelum write pertama hari itu
- [ ] simpan nama backup hasil preflight di handoff/notes

### B. Accounting decision lock
- [x] `2-390 Hutang ke Nugroho Pramono` confirmed tetap dibawa sebagai liability owner loan
- [x] `3-201b` diparkir ke `3-200b Laba Ditahan Rafia`
- [x] `1-121 Konstruksi dalam Pengerjaan` tetap parkir sementara ke `1-199`
- [x] zero-value rows tidak perlu diposting manual walau masih ada di audit trail CSV

### C. Module routing
- [ ] journal-only hanya untuk bucket `JOURNAL_ONLY`
- [ ] AR opening lewat package/module AR
- [ ] AP opening lewat package/module AP
- [ ] inventory opening lewat workflow inventory opening
- [ ] fixed asset opening lewat register asset / package aset tetap
- [ ] owner liability (`2-390`) diposting terpisah setelah keputusan final

## 4. Urutan eksekusi yang disarankan

1. Dry-run `journal draft` dulu
2. Post journal-only draft
3. Seed AR opening
4. Seed AP opening
5. Seed inventory opening
6. Seed fixed asset opening
7. Post owner liability bucket jika sudah disetujui
8. Reconcile trial balance akhir vs `final-staging-summary`

## 5. Verifikasi minimum setelah eksekusi

- [ ] total journal-only sesuai summary refreshed
- [ ] tidak ada row yang nyasar ke DB `polyflow`
- [ ] saldo `1-199` hanya berisi bridge/module transit yang memang expected
- [ ] setelah semua bucket selesai, trial balance tie ke staging final
- [ ] semua row review-required punya keputusan tertulis

## 6. Blocker yang masih tersisa

Ini yang masih perlu dijawab sebelum write final penuh:
1. keputusan final `2-390 Hutang ke Nugroho Pramono`
2. desain posting detail untuk AR opening
3. desain posting detail untuk AP opening
4. dataset detail inventory opening per item
5. dataset detail fixed asset opening per aset

## 7. Rekomendasi next move

Kalau lanjut sekarang, langkah paling aman adalah:
1. cek DB/container + backup fresh
2. review satu kali lagi bucket `review owner liability`
3. jalankan dry-run SQL journal-only
4. baru mulai posting bucket satu per satu
