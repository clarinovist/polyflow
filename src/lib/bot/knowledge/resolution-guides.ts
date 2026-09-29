/** Public guidance; no tenant data. Kept separate so publication never rewrites prior guides. */
export const resolutionGuides = [
    {
        slug: 'invoice-purchase-draft-dan-approval',
        title: 'Purchase Invoice Masih Draft: Pemeriksaan dan Approval',
        summary: 'Bedakan invoice pembelian/BILL dan invoice penjualan, cek asal nota/walk-in, PO, penerimaan, pembayaran dan jurnal sebelum approval Finance.',
        modules: ['purchasing', 'finance'], tags: ['invoice', 'purchase', 'bill', 'draft', 'approval', 'nota'],
        bodyMd: `## Mulai dari dokumen yang benar
Buka [Hutang / Invoice Pembelian](/finance/invoices/purchase), cari nomor BILL dan buka detailnya. Purchase invoice berbeda dari invoice penjualan. Salin nomor persis dari detail; data lama dapat memakai spasi di sekitar tanda hubung.

## Mengapa masih DRAFT?
Untuk invoice **dari nota/walk-in**, DRAFT berarti masih menunggu pemeriksaan dan approval Finance. Catat Pembayaran bukan pengganti approval: service pembayaran menolak invoice DRAFT. Periksa asal PO dan commercial review, jangan hanya melihat bahwa barang sudah diterima.

## Yang perlu diperiksa
1. Cocokkan BILL, PO dan penerimaan barang (GR). Invoice pembelian dapat dibuat untuk penerimaan sebagian; tidak harus menunggu seluruh PO selesai.
2. Periksa total, paidAmount, seluruh BILL pada PO yang sama dan jumlah barang yang benar-benar diterima. Selisih satu BILL terhadap seluruh PO bukan otomatis kesalahan.
3. Periksa jurnal PURCHASE_INVOICE dan periode tanggalnya. Status tagihan PAID tidak membuktikan jurnal lengkap atau benar.
4. Finance/Admin berwenang menjalankan alur approval invoice walk-in yang tersedia di aplikasi. **Jika tombol approval tidak tersedia di layar Anda, minta Admin/Finance memeriksa akses dan jalur dokumen; jangan mengganti status langsung, mencatat pembayaran fiktif, atau membuat invoice pengganti.**
5. Invoice DRAFT yang **bukan walk-in** jangan dipaksa melalui approval walk-in. Minta Finance menelusuri asal invoice dan jurnalnya.

## Bantuan asisten
Sebutkan nomor BILL dan minta diagnosis purchase invoice. Asisten dapat membaca status, PO/GR, nilai tagihan, pembayaran dan jurnal; asisten tidak menekan approval, mengubah status, atau menjamin posting berhasil. Bila nomor tidak ditemukan, cocokkan nomor di halaman sebelum membuat dokumen baru.

Jika periode tertutup, lihat [Period Locked](/support/error-period-locked-finance).`,
        sourcePaths: ['src/services/purchasing/walk-in-receipt-service.ts', 'src/services/purchasing/invoices-service.ts', 'src/components/finance/invoices/FinancialPurchaseInvoiceDetail.tsx'],
    },
    {
        slug: 'posting-kredit-retur-belum-tersedia', title: 'Mengapa Posting Kredit Retur Masih Abu-abu?',
        summary: 'Periksa penerimaan barang, invoice tujuan dan sisa piutang, riwayat kredit, usulan Finance, kuantitas alokasi serta tanggal posting.',
        modules: ['sales', 'finance'], tags: ['retur', 'posting', 'kredit', 'abu abu', 'disabled', 'draft', 'papan keuangan'],
        bodyMd: `## Retur barang tidak sama dengan kredit keuangan
Draft dari Sales belum mengurangi piutang. Cari dokumen di [Retur Penjualan Finance](/finance/returns), bukan hanya kartu Papan Keuangan. Panduan alur lengkap ada di [Retur dan Kredit Finance](/support/cara-retur-penjualan-dan-kredit-finance).

## Urutan pemeriksaan
1. Status retur harus **RECEIVED** atau **COMPLETED**. DRAFT/CONFIRMED belum memenuhi tahap ini. Jangan mencatat penerimaan fiktif agar tombol aktif.
2. Pastikan retur belum mempunyai kredit terposting/dibalik atau saldo kredit customer. Riwayat penyelesaian bukan alasan membuat kredit kedua.
3. Periksa invoice tujuan. Invoice DRAFT belum diakui; invoice PAID atau sisa piutang nol tidak dapat langsung dipotong lagi. Saldo kredit customer dan refund adalah alur berbeda, bukan pembayaran fiktif.
4. Di **Konfirmasi pengurangan piutang**, baca alasan jika usulan belum siap. Beberapa invoice, jurnal sumber belum terverifikasi, penyesuaian harga, atau riwayat alokasi dapat membutuhkan pemeriksaan manual Finance.
5. Pada opsi alokasi lanjutan, kuantitas tiap item/snapshot harus dipilih. Kolom belum lengkap membuat tindakan belum tersedia; jangan menganggapnya bug tanpa membaca alasan.
6. Isi tanggal posting pada periode terbuka. Usulan tersedia bukan jaminan posting: kondisi dokumen, akun, snapshot dan saldo diperiksa ulang saat konfirmasi.

## Jika perlu bantuan
Berikan nomor retur, status, invoice tujuan, tanggal yang dipakai, dan pesan alasan di layar. Asisten sekarang dapat menjalankan diagnosis read-only dengan tool kredit retur. Ia tidak menerima barang, menambah stok, memposting jurnal, ataupun mengubah piutang.

Lihat juga [Retur & potong tagihan](/support/cara-retur-dan-potong-tagihan) dan [Period Locked](/support/error-period-locked-finance).`,
        sourcePaths: ['src/components/finance/returns/FinanceReturnCredit.tsx', 'src/services/finance/return-credit-proposal-service.ts', 'src/services/finance/sales-return-credit-service.ts'],
    },
    {
        slug: 'periksa-closing-dobel-dan-adjustment-loss', title: 'Memeriksa Closing Ganda dan Inventory Adjustment Loss',
        summary: 'Nama jurnal mirip atau saldo adjustment negatif bukan bukti duplikasi. Cocokkan referensi, tanggal, status, debit/kredit dan sumber sebelum koreksi.',
        modules: ['finance'], tags: ['closing', 'dobel', 'adjustment', 'loss', 'negatif', 'neraca', 'laba ditahan'],
        bodyMd: `## Jangan koreksi hanya dari judul jurnal
Dua judul yang mengandung closing tidak otomatis dua kali menutup laba. Jurnal biaya gaji dan jurnal penutup dapat mempunyai makna berbeda. Nilai negatif pada akun adjustment juga tidak otomatis kerugian tambahan; arah debit/kredit dan sumber transaksi menentukan dampaknya.

## Pemeriksaan read-only
1. Buka [Jurnal](/finance/journals), cari kedua nomor jurnal. Catat tanggal, status DRAFT/POSTED/VOIDED, referenceType/referenceId dan sumbernya.
2. Bandingkan baris akun serta debit/kredit. Pastikan apakah keduanya benar-benar mewakili peristiwa yang sama; judul atau nominal yang sama saja belum cukup.
3. Buka [Periode Buku](/finance/periods) untuk mengetahui periode yang ditutup. Jangan membuka periode atau mengulang closing hanya agar tampilan berubah.
4. Untuk inventory adjustment, periksa pergerakan stok/stock opname dan jurnal sumber. Pengurangan atau pembalikan biaya mempunyai arah saldo berbeda. Jangan mengubah stok agar laba sesuai angka yang diharapkan.
5. Cocokkan laporan pada rentang tanggal yang sama. Bedakan laba berjalan, saldo laba ditahan dan jurnal penutup; jangan membuat jurnal manual kedua tanpa rekonsiliasi.

## Batas panduan
Panduan ini membantu mengumpulkan bukti, **bukan menyatakan jurnal tertentu duplikat atau adjustment tertentu benar**. Sertakan nomor jurnal, periode, akun dan sumber ketika meminta Finance memeriksa. Jika terbukti salah, gunakan alur reversal/koreksi ber-audit oleh pengguna berwenang; jangan menghapus histori atau mengedit saldo langsung.

Asisten dapat membantu rekonsiliasi read-only, tetapi belum memiliki diagnosis khusus semua jenis closing/adjustment. Lihat [Period Locked](/support/error-period-locked-finance).`,
        sourcePaths: ['src/services/accounting/journal-closing.ts', 'src/services/finance/finance-reconciliation-service.ts', 'src/services/accounting/account-resolver.ts'],
    },
    {
        slug: 'pembayaran-tagihan-dan-petty-cash', title: 'Pembayaran Tagihan Tidak Muncul di Petty Cash',
        summary: 'Bedakan pembayaran invoice, sumber akun kas/bank dan voucher kas kecil. Jangan input ulang untuk memaksa transaksi muncul di daftar lain.',
        modules: ['finance'], tags: ['pembayaran', 'tagihan', 'petty cash', 'kas kecil', 'rincian', 'dobel'],
        bodyMd: `## Dua daftar dengan tujuan berbeda
Pembayaran tagihan dan voucher kas kecil bukan dokumen yang sama. Pembayaran mengacu pada invoice serta akun/metode pembayaran. [Kas Kecil](/finance/petty-cash) menampilkan transaksi kas kecil seperti pengeluaran dan pengisian kembali. Transaksi tidak harus muncul di kedua daftar.

## Cara menelusuri
1. Buka detail invoice terkait dan periksa pembayaran: nomor, tanggal, jumlah, metode serta sisa tagihan.
2. Buka [Jurnal](/finance/journals) dan cari jurnal sumber pembayaran. Cocokkan akun kas/bank yang dipakai, debit/kredit dan status; label metode saja belum membuktikan sumber akun benar.
3. Jika benar-benar pembayaran dari kas kecil, minta Finance memeriksa mapping dan jurnal aktual. Jangan memasukkan voucher pengeluaran kedua hanya supaya transaksi muncul di menu kas kecil.
4. Untuk melihat rincian kas kecil, buka daftar kas kecil dan [laporan kas kecil](/finance/petty-cash/reports), gunakan periode yang sesuai. Jika akun/akses/menu tidak tersedia, minta Admin memeriksanya.
5. Dugaan pembayaran dobel harus dibandingkan berdasarkan invoice, nomor pembayaran, tanggal dan jurnal sumber. Nominal yang sama tidak cukup untuk menyimpulkan duplikasi.

## Koreksi dan batas
Asisten tidak memindahkan uang, membuat pembayaran, mengisi saldo atau menghapus jurnal. Bila sumber akun salah, Finance harus memilih koreksi/reversal yang sesuai dengan bukti dan periode terbuka. Jangan memakai pengisian kembali kas kecil sebagai transaksi penyeimbang yang tidak benar-benar terjadi.

Panduan ini bukan diagnosis nominal tertentu. Sertakan nomor invoice/pembayaran saat meminta penelusuran lebih lanjut.`,
        sourcePaths: ['src/services/finance/petty-cash-service.ts', 'src/actions/finance/payment-query-actions.ts', 'src/actions/finance/payment-mutation-actions.ts'],
    },
];
