/** Reviewed against the referenced UI/service paths. Global product guidance only. */
export const workflowGuides = [
    {
        slug: 'cara-menutup-po-diterima-sebagian',
        title: 'Cara Menutup PO yang Diterima Sebagian',
        summary:
            'Tutup sisa pesanan pembelian yang tidak akan dikirim lagi dari detail PO. Bukan menghapus PO atau menandai diterima lengkap.',
        modules: ['purchasing'],
        tags: [
            'po',
            'purchase order',
            'pembelian',
            'tutup',
            'closed',
            'close',
            'sebagian',
        ],
        bodyMd: `## Kapan dipakai
Gunakan **Tutup PO** jika PO berstatus **Diterima Sebagian (PARTIAL_RECEIVED)** dan sisa barang memang tidak akan dikirim lagi. Tindakan tersedia untuk Admin atau Procurement yang berwenang. Jangan mengubah jumlah penerimaan agar terlihat lengkap.

## Langkah
1. Buka [Pesanan Pembelian](/purchasing/orders), lalu buka detail PO yang dimaksud.
2. Periksa barang yang sudah diterima, sisa pesanan, dan tagihan terkait.
3. Pilih **Tutup PO**. Bila tidak terlihat, periksa status PO dan kewenangan pengguna; tidak semua status bisa ditutup melalui tindakan ini.
4. Isi **Alasan penutupan**, lalu baca kembali dampak yang ditampilkan.
5. Jika sudah benar dan sisa barang tidak akan dikirim, tekan **Ya, Tutup PO**.
6. Pastikan status menjadi **Ditutup (CLOSED)**, bukan Diterima Lengkap.

## Dampak dan batas
Jumlah pesanan, penerimaan aktual, stok, dan tagihan sebelumnya tidak berubah. PO yang ditutup tidak dapat menerima barang lagi. Pembatalan penerimaan tidak otomatis membuka PO kembali. Penutupan tidak sama dengan membatalkan invoice atau menghapus utang.

Asisten dapat menjelaskan panduan ini, tetapi penutupan dilakukan pengguna berwenang di aplikasi.`,
        sourcePaths: [
            'src/components/purchasing/orders/ClosePurchaseOrderDialog.tsx',
            'src/actions/purchasing/AGENTS.md',
        ],
    },
    {
        slug: 'cara-menghapus-po',
        title: 'Cara Menghapus Purchase Order (PO)',
        summary:
            'Hapus PO hanya untuk Draft atau Dibatalkan tanpa penerimaan barang maupun invoice. PO diterima sebagian memakai Tutup PO jika sisa tidak dikirim.',
        modules: ['purchasing'],
        tags: ['po', 'purchase order', 'pembelian', 'hapus', 'delete', 'draft'],
        bodyMd: `## Syarat
PO hanya dapat dihapus jika berstatus **Draft (DRAFT)** atau **Dibatalkan (CANCELLED)**, serta tidak mempunyai dokumen penerimaan barang maupun invoice. Sistem tetap memeriksa syarat dan hak akses saat tindakan dijalankan.

## Langkah
1. Buka [Pesanan Pembelian](/purchasing/orders), lalu buka detail PO.
2. Pastikan dokumen memang tidak diperlukan dan periksa status serta dokumen terkait.
3. Buka menu tindakan tambahan di detail PO, lalu pilih **Hapus PO**.
4. Baca dialog **Hapus Purchase Order?** dan pastikan nomor yang tertera benar.
5. Hanya jika yakin, konfirmasi **Hapus PO**. Ini penghapusan permanen, bukan sekadar menyembunyikan daftar.

## Jika tidak bisa dihapus
Jangan menghapus penerimaan atau invoice hanya untuk memaksa hapus PO. Jika PO sudah diterima sebagian dan sisa tidak akan datang, lihat [panduan Tutup PO](/support/cara-menutup-po-diterima-sebagian). Bila tombol tidak tersedia, cek status dan minta bantuan Admin untuk memeriksa kewenangan, bukan melewati pembatasan.

Asisten tidak menjalankan penghapusan, tetapi boleh memandu langkah dan menjelaskan risikonya.`,
        sourcePaths: [
            'src/components/purchasing/orders/PurchaseOrderDetailClient.tsx',
            'src/services/purchasing/orders-service.ts',
        ],
    },
    {
        slug: 'cara-retur-penjualan-dan-kredit-finance',
        title: 'Cara Retur Penjualan dan Posting Kredit di Finance',
        summary:
            'Lokasi menu retur, alur Draft sampai Diterima, dan syarat posting kredit untuk mengurangi piutang invoice. Bedakan retur barang dan kredit keuangan.',
        modules: ['sales', 'finance'],
        tags: [
            'retur',
            'return',
            'penjualan',
            'finance',
            'draft',
            'posting',
            'kredit',
            'form',
        ],
        bodyMd: `## Lokasi menu
- [Retur Penjualan di Sales](/sales/returns): membuat dan memproses dokumen retur sesuai akses pengguna.
- [Retur Penjualan di Finance](/finance/returns): memeriksa retur dan penyelesaian keuangannya. Gunakan pencarian dan filter status; jangan menyimpulkan draft tidak ada hanya dari kartu Papan Keuangan.
- [Retur & potong tagihan](/finance/returns/create): alur satu langkah untuk kondisi yang memenuhi syarat, dijelaskan di [panduan retur satu langkah](/support/cara-retur-dan-potong-tagihan).

## Membuat dokumen retur melalui Sales
1. Buka [form retur baru](/sales/returns/create).
2. Pilih **Referensi Sales Order**, periksa pelanggan, lalu pilih lokasi retur.
3. Isi alasan umum, catatan yang diperlukan, produk, jumlah dan kondisi barang sesuai keadaan sebenarnya.
4. Simpan dokumen sebagai Draft dan periksa detailnya. Draft belum berarti barang diterima atau piutang dikurangi.
5. Pada detail retur, lakukan **Konfirmasi Retur** jika data sudah benar. Penerimaan barang diproses oleh pengguna berwenang setelah barang benar-benar diterima. Jangan mencatat penerimaan fiktif untuk mengaktifkan posting.

## Posting kredit di Finance
1. Buka [Retur Penjualan](/finance/returns) dan detail retur terkait.
2. Retur harus sudah **Diterima (RECEIVED)** atau **Selesai (COMPLETED)**. Kredit yang sudah diposting atau sudah mempunyai penyelesaian kredit tidak boleh dibuat ulang.
3. Periksa bagian **Konfirmasi pengurangan piutang**. Jika usulan siap, cocokkan SO, invoice tujuan, nilai kredit termasuk pajak, dan sisa tagihan setelah posting.
4. Tentukan **Tanggal posting** pada periode yang masih terbuka.
5. Jika seluruh data benar, pilih **Konfirmasi & posting kredit retur**. Piutang invoice berkurang setelah berhasil; langkah kredit ini tidak menambah stok atau membuat pembayaran.

## Tombol abu-abu atau usulan belum siap
Baca alasan yang ditampilkan, bukan menebak penyebab. Periksa status penerimaan, invoice tujuan dan sisa tagihan, tanggal posting, serta apakah kredit sudah dibuat. Pada opsi alokasi, jumlah yang dialokasikan dan tanggal harus diisi. Invoice draft/lunas, beberapa invoice, snapshot historis tidak tersedia atau data tidak cocok dapat membutuhkan pemeriksaan lanjutan—tidak selalu bug.
Jika sistem belum memberi usulan yang siap, gunakan opsi pemeriksaan manual yang tersedia dengan bukti yang benar atau minta Finance meninjau; jangan memasukkan nominal sembarang, membuat retur duplikat, atau memposting jurnal pengganti hanya agar saldo cocok. Bila hasil posting tidak pasti, muat ulang dan periksa status sebelum mencoba lagi.`,
        sourcePaths: [
            'src/components/sales/SalesReturnForm.tsx',
            'src/components/sales/SalesReturnDetailClient.tsx',
            'src/components/finance/returns/FinanceReturnCredit.tsx',
            'src/components/finance/returns/ReturnCreditConfirmation.tsx',
        ],
    },
    {
        slug: 'cara-retur-dan-potong-tagihan',
        title: 'Cara Mengisi Retur & Potong Tagihan di Finance',
        summary:
            'Retur satu langkah untuk barang baik yang benar-benar sudah diterima kembali dan SO dengan invoice belum lunas. Periksa potongan sebelum konfirmasi.',
        modules: ['finance', 'sales'],
        tags: [
            'retur',
            'return',
            'finance',
            'potong tagihan',
            'mengisi',
            'form',
            'penjualan',
        ],
        bodyMd: `## Kapan memakai alur ini
Untuk Admin/Finance yang berwenang, barang **dalam kondisi baik dan sudah diterima kembali**, serta SO yang masih mempunyai tagihan. Jangan gunakan untuk retur yang sudah pernah dicatat diterima; itu berisiko menghitung barang dua kali. Barang rusak, beberapa invoice/pengiriman, atau nilai yang perlu rekonsiliasi memakai pemeriksaan terpisah.

## Langkah
1. Buka [Finance → Retur Penjualan](/finance/returns), pilih **Retur & potong tagihan**, atau buka [form satu langkah](/finance/returns/create).
2. Cari nomor SO bila diperlukan, lalu pilih **Referensi SO** yang benar.
3. Isi **Jumlah retur** per produk memakai satuan yang tercantum. Kosongkan atau isi 0 untuk produk yang tidak diretur. Harga, pajak, pelanggan dan gudang berasal dari dokumen sumber, bukan diketik sembarang.
4. Tekan **Periksa potongan**.
5. Cocokkan tagihan sebelum retur, potongan termasuk pajak, sisa tagihan setelah retur, dan lokasi masuk stok. Untuk invoice lama tanpa snapshot, periksa usulan dari SO dengan cermat.
6. Centang pernyataan bahwa barang baik sudah diterima sesuai jumlah dan Anda menyetujui perubahan tersebut.
7. Tekan **Simpan retur & potong tagihan** sekali. Setelah berhasil, periksa hasil retur dan sisa tagihan.

## Bila terhenti
Tombol simpan tetap nonaktif sebelum pernyataan dikonfirmasi. Jika pencarian tidak menemukan SO dengan invoice belum lunas, periksa invoice di Finance, bukan membuat retur ulang. Jika pemeriksaan menolak kondisi atau nominal, ikuti alasan yang ditampilkan dan gunakan pemeriksaan terpisah. Jangan mengulangi transaksi saat hasil simpan belum diketahui; muat ulang dan cek dokumen terlebih dahulu.

Alur ini sekaligus mencatat barang kembali dan pengurangan tagihan. Berbeda dari posting kredit untuk retur yang barangnya sudah dicatat diterima sebelumnya.`,
        sourcePaths: [
            'src/components/finance/returns/QuickSalesReturnForm.tsx',
            'src/app/finance/returns/create/page.tsx',
        ],
    },
] as const;
