# Pemulihan biaya ATK — koreksi terbatas, bukti sumber, dan kompensasi

Halaman **Finance → Rekonsiliasi nilai ATK** (`/finance/inventory-reconciliation`)
hanya untuk diagnosis dan koreksi nilai ATK operasional (office/ATK). Halaman ini
tidak mengubah kuantitas, WAC, atau biaya historis SPK. Baca diagnosis lebih dulu;
angka yang tampil adalah bukti yang dibatasi, bukan pengesahan seluruh biaya.

## Kelayakan

Koreksi hanya menerima kelebihan pembebanan loss yang terbukti:

- satu mutasi sumber dengan satu baris jurnal loss yang seimbang dan diposting;
- akun kapitalisasi berasal dari jurnal sumber SKU itu sendiri, bukan akun SKU lain;
- biaya per unit sama dengan WAC stok saat ini dan dengan setiap penerimaan sumber;
- satu lokasi, tanpa transfer, custody, atau riwayat campuran;
- periode jurnal tujuan masih OPEN.

Sistem menolak sumber yang ambigu, jurnal hilang/void/tidak seimbang, selisih nol
atau kurang bayar, mutasi yang sudah pernah dikoreksi, serta sumber yang terkait
produksi/SPK. Koreksi tidak boleh dipakai untuk mengisi biaya nol atau menautkan
saldo awal.

## Alur aman

1. Cari SKU → **Periksa** → baca diagnosis dan batas bukti.
2. Pilih mutasi sumber dan jenis **REFUND** (atau **COMPENSATION** untuk membalik
   refund yang sudah ada), lalu **Periksa usulan koreksi**.
3. Isi alasan, centang persetujuan, lalu **Setujui dan terapkan koreksi**.
4. Jika respons hilang, jangan membuat permintaan baru. Nomor permintaan disimpan
   di browser; gunakan **Ulangi permintaan yang sama** atau **Periksa bukti
   tersimpan**. Permintaan dengan `requestId` yang sama bersifat idempoten.

Sebelum menulis, service menghitung ulang fingerprint dari snapshot read-only dan
membandingkannya dengan preview. Backup bukti disimpan ke
`backups/tenants/<tenant>/atk-cost-recovery/<uuid>.json` di bucket privat, lalu
dibaca kembali dan diverifikasi SHA-256. Jika backup gagal, koreksi tidak
diterapkan. Jurnal, dokumen koreksi, bukti, dan audit ditulis dalam satu transaksi;
kegagalan audit membatalkan semuanya.

## Refund dan kompensasi

`REFUND` mengembalikan kelebihan loss: debit akun persediaan milik SKU, kredit akun
loss sumber. `COMPENSATION` adalah kebalikannya dan hanya boleh menunjuk satu
refund yang sudah ada. Tidak ada pembatalan/penghapusan dokumen koreksi.

Trigger database membuat baris `AtkCostCorrection`, `AtkCostEvidence`, serta
`StockMovement`/`JournalEntry`/`JournalLine` yang dipakai sebagai bukti menjadi
tidak dapat diubah atau dihapus. Jangan mencoba membatalkan lewat void jurnal biasa;
buat kompensasi. Penghapusan tagihan pembelian juga ditolak bila penerimaannya
dipakai sebagai bukti ATK.

## Izin dan audit

Diagnosis memerlukan akses Finance; penerapan memerlukan approver Finance/Admin.
Aktor diambil dari sesi dan diverifikasi ulang di dalam transaksi. Audit
`ATK_COST_REFUND`/`ATK_COST_COMPENSATION` disimpan di dalam transaksi yang sama.
Jangan menaruh data tenant, nominal produksi, atau isi backup di dokumen ini.

## Batas yang disengaja

- Tidak mengubah kuantitas, WAC, atau biaya SPK; bukan revaluasi umum.
- Tidak memperbaiki ATK tanpa bukti sumber yang lengkap; gunakan alur koreksi
  operasional/opening attribution yang terpisah.
- Bukan pengganti rekonsiliasi Finance: diagnosis menandai bukti yang terbatas dan
  tidak menyatakan seluruh saldo sudah cocok.
