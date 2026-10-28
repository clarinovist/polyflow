# Pemulihan biaya SPK — tahap metadata terbatas

## UI dan batas akses

Admin yang sudah berhak membuka detail SPK dapat memakai panel **Pemeriksaan &
pemulihan biaya SPK** pada **Biaya & Isu**. Finance dapat membuka
`/finance/production-cost-recovery` melalui **Pemulihan biaya SPK**, dengan izin
resource Finance yang berlaku. Panel tidak memberi akses workspace Produksi baru.
Setiap action tetap memeriksa peran ADMIN/FINANCE dan tenant di server.

Cari nomor SPK persis di workspace aktif → **Periksa biaya** → baca preview →
isi alasan dan persetujuan → **Setujui & terapkan koreksi**. Sesudah berhasil,
periksa ulang kondisi SPK. Total hasil yang sudah tersimpan bukan jumlah untuk
input ulang. Hasil baru tetap harus melewati validasi produksi normal.

## Mode yang didukung

Hanya normalisasi affal historis dengan biaya kosong menjadi biaya eksplisit nol
serta tautan execution/kepemilikan, bila seluruh bukti berikut tersedia:

- SPK non-maklon IN_PROGRESS, bukan actual-packaging, tanpa biaya konversi.
- Satu hasil positif, tidak ada void atau affal-only yang memerlukan kebijakan.
- Jurnal bahan/hasil valid dan seluruh biaya terserap **per akun sumber**.
- Catatan affal dapat diatribusikan unik ke execution asal.
- Riwayat SKU affal hanya terdiri dari penerimaan yang ditinjau; tidak ada
  saldo awal tak terjelaskan, transaksi lain, konsumsi, penjualan atau reset.
- Kuantitas persediaan cocok tepat dengan penerimaan dan WAC eksplisit nol.

Mode ini tidak mengubah jumlah, inventory WAC, biaya hasil baik, atau jurnal.
Beberapa hasil, sisa biaya historis, affal bernilai, atau penggunaan lanjutan
memerlukan rekonstruksi valuasi terpisah. UI menampilkan penghambat dan tidak
menawarkan penerapan. Jangan menggunakan jurnal manual, void hasil benar,
penyesuaian stok, atau hitung ulang BOM untuk melewati pemeriksaan.

## Atomicity, backup, dan retry

Server memeriksa ulang preview dalam transaksi Serializable dengan lock WO,
execution, movement, jurnal/baris jurnal, dan inventory affal. Perubahan sumber
membatalkan preview. Tidak ada retry otomatis dengan nominal/perubahan baru.

Sebelum mutasi, server menyimpan before-image **hanya kolom metadata yang akan
berubah** ke namespace backup privat R2 yang sudah tersedia, menggunakan key
unik dan conditional put, lalu membaca ulang dan memverifikasi SHA-256. Tidak
ada URL backup atau kredensial dikirim ke browser. Konfigurasi storage saja
bukan bukti backup berhasil; kegagalan upload/readback/hash membatalkan apply.

Audit existing `NORMALIZE_ABSORBED_PRODUCTION_SCRAP:<orderId>` menyimpan before
state, alasan, pelaksana, referensi backup, fingerprint, versi web, serta bukti
postcondition. Mutasi dan audit commit bersama. Pemeriksaan pascamutasi di dalam
transaksi memastikan hanya metadata yang disetujui berubah dan WIP nol. Gagal
verifikasi/audit → rollback. Backup yang sudah dibuat sebelum rollback tetap
disimpan sebagai bukti; jangan dihapus otomatis atau dijadikan endpoint gambar.

Jika respons hilang, ulangi **permintaan dengan fingerprint yang sama** untuk
membaca bukti commit tanpa menggandakan koreksi. Riwayat `already_applied` bukan
jaminan SPK tetap bersih setelah transaksi lain; jalankan inspeksi baru.

## Recovery operasional

Tidak ada tombol undo otomatis. Jika pembatalan koreksi diperlukan:

1. Dapatkan persetujuan operasi data, verifikasi tenant/order/audit dan backup.
2. Cocokkan before-image eksternal beserta hash, audit, nilai metadata sesudah,
   dan seluruh aktivitas setelah koreksi. Bila ada hasil/void/transaksi baru,
   jangan mengembalikan snapshot lama secara buta.
3. Susun preview pemulihan melalui tooling teraudit dan uji di DB terisolasi.
   Terapkan hanya dalam transaksi dengan lock, conditional state checks dan
   audit baru; jangan hapus audit lama atau mengganti saldo fisik.
4. Verifikasi ulang sumber biaya dan konsekuensi untuk produksi berikutnya.

## Gate dan keterbatasan

Unit/action/component tests menguji auth/input, unsupported cases, preview,
backup failures dan retry. Kontrak PostgreSQL ditambahkan pada suite existing
`absorbed-scrap-normalization-postgres.test.ts`, yang sudah termasuk runner
`scripts/ci/run-postgres-contracts.sh`: atomicity, postconditions, staleness,
dedupe dan concurrent writers harus lolos sebelum rilis. Mock test bukan bukti
bahwa transaksi PostgreSQL benar.

Tahap ini bukan engine koreksi HPP historis multi-output. Kelulusan pemeriksaan
WIP sendiri juga bukan bukti semua biaya historis sudah direkonsiliasi. Rilis
kode dan koreksi data produksi masing-masing memerlukan otorisasi tersendiri.
