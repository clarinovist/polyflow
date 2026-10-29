# Pemulihan biaya SPK — koreksi terbatas dan batas biaya ke depan

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

## Melanjutkan produksi tanpa mengubah biaya historis

Jika kebijakan owner adalah mempertahankan nilai lama, **jangan jalankan koreksi
historis**. Pada hasil pemeriksaan yang perlu ditinjau, gunakan **Lanjutkan tanpa
mengubah biaya lama → Periksa kelayakan batas biaya**. Admin/Finance meninjau
jumlah hasil/mutasi lama dan sisa biaya historis, mengisi alasan, lalu menyetujui
**Aktifkan batas biaya baru**.

Ini bukan pemutihan biaya lama. Aktivasi hanya menyimpan bukti batas biaya dengan
ID sumber persis; tidak mengubah stok, WAC, hasil, affal, jurnal atau HPP lama.
Biaya yang tersisa sebelum batas tetap tercatat secara terpisah dan tidak boleh
mendanai hasil berikutnya. Hasil baru hanya memakai jurnal bahan sesudah batas,
dengan seluruh pemeriksaan stok dan jurnal normal tetap aktif.

Mode ini memerlukan SPK non-maklon IN_PROGRESS, seluruh hasil lama sudah selesai,
total hasil sesuai mutasi, sumber bahan/hasil valid, dan affal kosong yang
teratribusi unik. Periode tidak dapat dimulai jika ada hasil berjalan/void,
bahan manual/konsolidasi, staged/pending, pembalik sumber, atau saldo historis
negatif per akun. Sistem memverifikasi ulang sumber saat membaca biaya baru;
perubahan/penghapusan catatan lama mengakibatkan penolakan, bukan reinterpretasi.

Hasil sebelum batas tidak dapat di-void otomatis. Pembatalan bahan terpisah pada
SPK berbatas biaya juga memerlukan pemeriksaan khusus. Hasil setelah batas tetap
mengikuti jalur void yang ada dan tidak boleh membalik sumber sebelum batas.

Bukti `START_PRODUCTION_COST_PERIOD:<orderId>` adalah data pengendali pembukuan:
**jangan hapus atau ubah**, termasuk sesudah 90 hari. Cron pembersihan audit
mengecualikan action ini. Backup privat berisi bukti periode dan hash sumber;
aktivasi gagal jika backup/readback gagal. Retry fingerprint yang sama tidak
membuat batas kedua. Laporan kesehatan dan UI tetap menyebut biaya historis yang
dipertahankan—bukan menyatakan seluruh biaya sudah direkonsiliasi.

### Aktivasi operasional melalui artifact terverifikasi

Untuk operator sistem tanpa sesi browser Finance, image CI juga menyertakan
`scripts/start-production-cost-period.js`. CLI memakai service yang sama, bukan
SQL patch alternatif. Gunakan `--input=/absolute/reviewed.json` untuk preview;
`--execute --yes` hanya setelah fingerprint preview ditinjau. Input memuat tenant,
database, ID+nomor SPK persis, aktor Finance/Admin, alasan dan (untuk execute)
fingerprint. Jangan simpan input produksi di repo.

CLI memverifikasi registry tenant dan identitas order, lalu menyimpan bukti ke
`/app/backups/production-cost-period/` (mount backup host yang sudah ada), dengan
exclusive create, fsync dan SHA-256 readback. Sesudah apply, CLI membaca kembali
bukti dan biaya periode baru. Tidak menerima nominal/jurnal atau path backup dari
browser/input. Jalankan hanya artifact exact SHA yang sudah lolos gate rilis;
backup dan input privat tetap disimpan untuk recovery, bukan dihapus otomatis.

### Riwayat kompleks: mode tinjauan terpisah (UI & CLI)

`mode: "REVIEWED_LEGACY_SEAL"` adalah versi bukti kedua, bukan opsi paksa.
Versi pertama (`STRICT`) tetap ketat dan tidak diubah/di-upgrade otomatis.
Bila pemeriksaan `STRICT` ditolak dengan `PRODUCTION_COST_PERIOD_INVALID`,
Admin/Finance dapat memilih **Periksa mode riwayat khusus** di UI, atau
operator sistem menjalankan CLI setelah preview disetujui. Aktivasi wajib
menyertakan `acknowledgeRetainedAnomalies: true` beserta fingerprint yang sama
(dan di UI, alasan minimal 30 karakter).

Saldo historis **bertanda per akun**, void lama, jurnal affal bernilai, dan
catatan affal manual tetap disimpan apa adanya. Mode ini tidak mengisi biaya
kosong, mengarang tautan pembalik, menghapus saldo negatif, atau membuat jurnal
penyeimbang. Laporan menyebut kategori anomali yang dipertahankan dan saldo per
akun, bukan hanya jumlah bersih yang bisa menyembunyikan tanda negatif.

Syarat tetap wajib: tidak ada sesi nonvoid terbuka; total hasil nonvoid cocok
dengan hasil bersih mutasi dan total SPK; jumlah bersih bahan/affal cocok dengan
catatan pendukung; semua jurnal bahan/hasil tunggal, POSTED, seimbang, IDR dan
bersumber valid. Pending/staged/manual-konsolidasi, pemilik asing, jurnal sumber
hilang, pembalik lintas batas atau perubahan sumber membatalkan aktivasi.
MaterialIssue dan ScrapRecord lama ikut dibekukan lewat ID+hash. Pembatalan lama
yang sudah tertutup boleh tetap tanpa tautan, tetapi tidak boleh digunakan untuk
membalik transaksi baru atau dianggap sebagai bukti pasangan individual.

Start/handover mengecualikan VOIDED dan hasil beku; stop/log menolak keduanya
sebelum update, termasuk jumlah nol, dengan lock WO. Sesi nonvoid berjumlah nol
namun `endTime=NULL` **tetap dianggap sesi terbuka**; umur/status default
COMPLETED tidak membuktikan ia tidak dipakai. Jangan menutupnya tanpa konfirmasi
operasional. Pemeriksaan saldo GL agregat tetap aktif setelah batas—batas biaya
bukan cara mendanai persediaan dari jurnal yang tidak ada.

## Mode koreksi metadata yang didukung

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
