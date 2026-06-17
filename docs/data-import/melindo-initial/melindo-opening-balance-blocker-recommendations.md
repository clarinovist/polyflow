# Melindo — Recommended Decisions for Opening Balance Blockers

Context:
- Customer, supplier, dan product master sudah masuk.
- Opening balance belum boleh dieksekusi penuh karena sumber `NERACA MEI` belum balance.
- Selisih saat ini: `115,424,057`.

## Ringkasan rekomendasi utama

### 1) 1-121 Konstruksi dalam Pengerjaan — 8,165,000
Status:
- Tidak ada akun COA live yang cocok langsung.
- Search COA tidak menemukan akun `Konstruksi dalam Pengerjaan` / `Construction in Progress`.
- Akun paling dekat yang ada hanyalah:
  - `1-132 Persediaan Barang dalam Proses Rafia` -> ini inventory WIP, bukan fixed-asset construction
  - `1-199 Rekening Sementara` -> akun penampung sementara

Rekomendasi:
- Jangan paksa map ke `1-132`, karena itu salah nature.
- Pilihan paling aman:
  1. ideal: buat akun fixed-asset baru untuk `Konstruksi dalam Pengerjaan`, lalu post ke sana
  2. fallback sementara: parkir ke `1-199 Rekening Sementara` dengan note jelas bahwa ini CIP yang belum dipetakan permanen

Rekomendasi final saya:
- Jika targetnya cepat jalan tanpa redesign COA hari ini: pakai `1-199 Rekening Sementara` sementara.
- Setelah itu buat task follow-up untuk bikin akun CIP permanen dan reklasifikasi.

Why:
- Nilainya kecil relatif terhadap total aset
- Tapi nature akunnya spesifik, jadi jangan dipaksa ke inventory atau fixed asset lain

### 2) 2-390 Hutang ke Nugroho Pramono — 681,000,000
Status:
- Akun ini sudah ada di COA live: `2-390 Hutang ke Nugroho Pramono`
- Tidak ada masalah mapping teknis
- Isu utamanya adalah substansi bisnis: liability sungguhan vs modal pemilik

Rekomendasi:
- Untuk opening awal, pertahankan dulu sebagai liability di `2-390`
- Jangan reklasifikasi otomatis ke modal tanpa keputusan owner/accounting

Rekomendasi final saya:
- Book as-is ke `2-390 Hutang ke Nugroho Pramono`

Why:
- Akun memang sudah tersedia spesifik
- Lebih aman mempertahankan bentuk hutang dulu daripada salah mengubahnya menjadi equity
- Kalau nanti diputuskan itu sebenarnya setoran modal, reklasifikasi ke ekuitas bisa dilakukan dengan jurnal terkontrol

### 3) 3-201b Laba Tahun Berjalan — 179,711,418.12
Status:
- Akun `3-201b` tidak ada sebagai akun live terpisah di COA saat ini
- Yang ada adalah `3-200b Laba Ditahan Rafia`
- Angka ini juga tidak tie langsung ke `LABA/RUGI BERSIH` Mei (`53,909,462.82`)

Rekomendasi:
- Jangan buat posting langsung seolah-olah angka ini adalah current-period P&L yang siap dipakai
- Untuk opening balance snapshot, lebih aman gabungkan ke `3-200b Laba Ditahan Rafia`

Rekomendasi final saya:
- Map `3-201b Laba Tahun Berjalan` -> `3-200b Laba Ditahan Rafia`
- Tambahkan note bahwa ini adalah historical carry-forward dari buku lama, bukan hasil posting P&L yang dibangun ulang di PolyFlow

Why:
- Kita sedang migrasi posisi awal, bukan merekonstruksi histori bulanan akuntansi penuh
- Retained earnings adalah landing place paling aman untuk saldo historical profit yang belum direplay period-by-period

## Keputusan tambahan yang implisit tapi penting

### 4) Selisih neraca 115,424,057
Status:
- `TOTAL ASET` ≠ `TOTAL HUTANG & EKUITAS`
- Selisih = `115,424,057`

Rekomendasi final saya:
- Jangan execute opening balance final sampai selisih ini diputuskan
- Kalau user ingin sistem cepat operasional sambil menunggu rekonsiliasi, ada 2 opsi:
  1. opsi konservatif: tahan posting opening balance final
  2. opsi pragmatis sementara: parkir selisih ke `1-199 Rekening Sementara` atau akun suspense transisi, lalu follow-up rekonsiliasi wajib

Pilihan yang saya sarankan:
- Untuk integritas akuntansi: tahan final posting sampai selisih dijelaskan
- Untuk operasional cepat: suspense sementara diperbolehkan, tapi harus diberi label eksplisit dan tidak dianggap final books

## Rekomendasi implementasi operasional

Jika kita lanjut dengan pendekatan paling pragmatis dan aman:
1. Map `1-121` -> `1-199 Rekening Sementara`
2. Keep `2-390` as-is
3. Map `3-201b` -> `3-200b`
4. Skip semua row nol
5. Flag selisih `115,424,057` sebagai suspense / unresolved migration difference
6. Baru setelah itu generate draft opening-balance staging final

## Final recommendation set

Saya rekomendasikan set keputusan berikut:
- `1-121 Konstruksi dalam Pengerjaan` -> `1-199 Rekening Sementara` (sementara)
- `2-390 Hutang ke Nugroho Pramono` -> keep as `2-390`
- `3-201b Laba Tahun Berjalan` -> `3-200b Laba Ditahan Rafia`
- selisih `115,424,057` -> jangan disembunyikan; tandai eksplisit sebagai unresolved migration difference sampai direkonsiliasi

## Consequence

Dengan keputusan di atas, saya bisa lanjut membuat:
- opening-balance staging final version
- daftar akun yang masuk journal only
- daftar akun yang harus lewat module (AR/AP/inventory/fixed asset)
- daftar unresolved items yang tetap perlu perhatian setelah go-live awal
