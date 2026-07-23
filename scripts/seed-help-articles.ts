import { PrismaClient, HelpArticleStatus, HelpArticleSource } from '@prisma/client';

const mainDb = new PrismaClient();

interface SeedArticle {
  slug: string;
  title: string;
  summary: string;
  bodyMd: string;
  modules: string[];
  tags: string[];
  errorCodes: string[];
  source: HelpArticleSource;
}

const seedArticles: SeedArticle[] = [
  {
    slug: 'cara-buat-sales-order',
    title: 'Cara Buat Sales Order (SO)',
    summary: 'Panduan langkah-langkah membuat Sales Order baru di modul Sales.',
    bodyMd: `## Langkah-langkah

1. Buka menu **Sales** → **Sales Order** di sidebar kiri.
2. Klik tombol **+ Baru** di pojok kanan atas.
3. Pilih **Customer** dari dropdown (ketik nama untuk filter).
4. Isi **Tanggal Order** (default: hari ini).
5. Tambahkan item produk:
   - Klik **+ Tambah Item**.
   - Pilih **Produk** dan **Variant** (misal: MP 15 - Roll).
   - Masukkan **Quantity** dalam satuan yang benar (KG / Roll / Pcs).
   - Harga otomatis terisi dari master harga; ubah manual jika perlu.
6. Ulangi langkah 5 untuk setiap item pesanan.
7. Cek **Total Amount** di bagian bawah — pastikan benar.
8. Klik **Simpan** untuk menyimpan draft SO.

## Setelah SO Dibuat

- SO masih berstatus **DRAFT**. Untuk memproses, lakukan **Konfirmasi SO**.
- SO yang sudah dikonfirmasi akan muncul di daftar produksi dan warehouse.

## Tips

- Jika produk tidak muncul di dropdown, pastikan variant sudah aktif di **Master Data** → **Produk**.
- Untuk SO repeat order, gunakan fitur **Duplikat** dari SO sebelumnya.
- Catatan khusus (misal: warna, ukuran spesial) bisa diisi di field **Remarks**.

## Troubleshooting

- **"Stok tidak cukup"** saat konfirmasi → lihat artikel "Cara Confirm SO Stok Kurang".
- **Customer tidak muncul** → pastikan customer sudah terdaftar di menu **Sales** → **Customer**.`,
    modules: ['sales'],
    tags: ['sales-order', 'so', 'order', 'cara-pakai'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-confirm-so-stok-kurang',
    title: 'Cara Confirm SO Ketika Stok Kurang',
    summary: 'Solusi ketika konfirmasi Sales Order gagal karena stok tidak mencukupi.',
    bodyMd: `## Penyebab Error

Error **"Insufficient Stock"** muncul ketika stok fisik produk di gudang kurang dari quantity yang diminta di Sales Order.

## Langkah Cek

1. Buka menu **Warehouse** → **Inventory**.
2. Cari produk yang dimaksud.
3. Periksa **Qty Fisik** di setiap lokasi gudang.
4. Bandingkan dengan total quantity di SO (perhatikan: satu SO bisa punya beberapa baris produk yang sama — jumlahkan semuanya).

## Solusi

### Opsi 1: Tunggu stok masuk
- Jika ada Incoming Goods / produksi yang sedang berjalan, tunggu hingga stok tersedia.
- Cek menu **Production** → **Production Orders** untuk melihat SPK yang sedang berjalan.

### Opsi 2: Kurangi quantity SO
- Edit SO, kurangi quantity item yang stoknya kurang.
- Klik **Simpan** ulang, lalu **Konfirmasi**.

### Opsi 3: Split SO
- Pisahkan item yang stoknya cukup ke SO baru.
- Konfirmasi SO yang stoknya tersedia.
- SO sisa menunggu stok masuk.

## Pencegahan

- Cek stok sebelum membuat SO (menu **Warehouse** → **Inventory**).
- Atur **Minimum Stock Alert** di Master Produk agar dapat notifikasi stok rendah.`,
    modules: ['sales', 'warehouse'],
    tags: ['stok-kurang', 'insufficient-stock', 'konfirmasi', 'troubleshoot'],
    errorCodes: ['STOCK_INSUFFICIENT'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-jadwal-kirim-dan-surat-jalan',
    title: 'Cara Atur Jadwal Kirim & Buat Surat Jalan',
    summary: 'Panduan menjadwalkan pengiriman dan mencetak surat jalan dari Sales Order.',
    bodyMd: `## Prasyarat

- Sales Order sudah **Confirmed** atau **In Production**.

## Langkah Jadwal Kirim

1. Buka menu **Sales** → **Sales Order**.
2. Klik SO yang ingin dijadwalkan.
3. Klik tab **Delivery Schedule** atau tombol **Atur Pengiriman**.
4. Isi:
   - **Tanggal Rencana Kirim**.
   - **Alamat Kirim** (default dari customer, bisa diubah).
   - **Catatan Kurir** (opsional).
5. Klik **Simpan Jadwal**.

## Buat Surat Jalan (SJ)

1. Dari detail SO, klik tombol **Buat Surat Jalan**.
2. Periksa item dan quantity yang akan dikirim.
3. Klik **Proses** → Surat Jalan otomatis terbuat.
4. Cetak SJ dari menu **Warehouse** → **Outgoing** → **Delivery**.

## Tips

- Pastikan stok sudah tersedia sebelum membuat SJ.
- SJ yang sudah diproses tidak bisa dihapus — gunakan fitur **Void** jika perlu pembatalan.`,
    modules: ['sales', 'warehouse'],
    tags: ['surat-jalan', 'pengiriman', 'delivery', 'jadwal-kirim'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-terima-barang-gudang',
    title: 'Cara Terima Barang di Gudang (Incoming)',
    summary: 'Panduan menerima barang masuk dari supplier atau produksi ke gudang.',
    bodyMd: `## Langkah-langkah

1. Buka menu **Warehouse** → **Incoming Goods**.
2. Klik **+ Terima Barang Baru**.
3. Pilih **Supplier** atau **Sumber** (dari Purchase Order / produksi internal).
4. Jika dari PO:
   - Pilih **Purchase Order** terkait.
   - Item otomatis terisi dari PO.
5. Untuk setiap item:
   - Periksa **Quantity Diterima** sesuai fisik.
   - Pilih **Lokasi Penyimpanan** di gudang.
   - Catat jika ada **selisih** (qty diterima ≠ qty PO).
6. Klik **Proses Penerimaan**.

## Setelah Barang Diterima

- Stok otomatis bertambah di lokasi yang dipilih.
- Status PO berubah menjadi **Received** (jika semua item diterima).
- Cetak **Berita Acara Penerimaan** jika diperlukan.

## Tips

- Lakukan pengecekan fisik sebelum proses penerimaan.
- Jika ada kerusakan / selisih, catat di field **Notes** dan pilih status **Partial**.
- Untuk retur, gunakan menu **Warehouse** → **Returns**.`,
    modules: ['warehouse', 'purchasing'],
    tags: ['terima-barang', 'incoming', 'penerimaan', 'gudang'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-cek-stok-per-lokasi',
    title: 'Cara Cek Stok Per Lokasi Gudang',
    summary: 'Melihat ketersediaan stok produk berdasarkan lokasi penyimpanan di gudang.',
    bodyMd: `## Langkah-langkah

1. Buka menu **Warehouse** → **Inventory**.
2. Gunakan filter:
   - **Produk**: ketik nama produk (misal: "MP 15").
   - **Lokasi**: pilih lokasi gudang spesifik (misal: "Gudang A", "Rak B3").
3. Tabel menampilkan:
   - **Nama Produk** dan **Variant**.
   - **Lokasi** penyimpanan.
   - **Qty Fisik** (stok aktual).
   - **Qty Reserved** (sudah dialokasikan ke SO).
   - **Qty Available** (fisik - reserved).

## Membaca Data

- **Qty Fisik** = jumlah barang fisik di gudang.
- **Qty Reserved** = jumlah yang sudah dipesan customer (belum dikirim).
- **Qty Available** = Qty Fisik - Qty Reserved → ini yang bisa dijual lagi.

## Tips

- Gunakan filter **"Stok Kritis"** untuk melihat produk yang di bawah minimum.
- Export ke Excel dengan tombol **Export** di pojok kanan atas tabel.
- Untuk melihat history mutasi stok, klik nama produk → tab **History**.`,
    modules: ['warehouse'],
    tags: ['stok', 'inventory', 'cek-stok', 'lokasi'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-outgoing-muat-kirim',
    title: 'Cara Proses Outgoing & Muat Kirim',
    summary: 'Panduan memproses barang keluar dari gudang untuk pengiriman ke customer.',
    bodyMd: `## Prasyarat

- Surat Jalan (SJ) sudah dibuat dari Sales Order.

## Langkah-langkah

1. Buka menu **Warehouse** → **Outgoing**.
2. Cari Surat Jalan berdasarkan **nomor SJ** atau **Customer**.
3. Klik SJ untuk membuka detail.
4. Untuk setiap item:
   - Ambil barang dari **lokasi** yang tercatat.
   - Scan atau verifikasi **quantity** sesuai SJ.
   - Centang **"Ready"** jika barang sudah siap muat.
5. Klik **Proses Muat** ketika semua item sudah ready.
6. Stok otomatis berkurang sesuai quantity yang dikirim.

## Setelah Muat

- Status SJ berubah menjadi **Shipped**.
- Customer bisa melacak status pengiriman.
- Cetak **Delivery Note** untuk tanda terima customer.

## Tips

- Jika stok tidak cukup saat muat, cek apakah ada SO lain yang belum dikirim (reserved).
- Untuk pembatalan, gunakan fitur **Void** (butuh alasan pembatalan).`,
    modules: ['warehouse', 'sales'],
    tags: ['outgoing', 'muat', 'kirim', 'pengiriman'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-spk-batch-harian',
    title: 'Cara Buat SPK Batch Harian Produksi',
    summary: 'Panduan membuat Surat Perintah Kerja (SPK) untuk produksi batch harian.',
    bodyMd: `## Langkah-langkah

1. Buka menu **Production** → **Production Orders**.
2. Klik **+ SPK Baru**.
3. Pilih **BOM (Bill of Materials)** — ini resep/formula produk.
4. Isi:
   - **Planned Quantity** = jumlah yang akan diproduksi.
   - **Mesin** = pilih mesin yang akan digunakan.
   - **Shift** = pagi / siang / malam.
   - **Tanggal Mulai** = hari ini atau jadwal yang direncanakan.
5. Klik **Simpan** → SPK berstatus **PLANNED**.
6. Klik **Mulai Produksi** → status berubah **IN_PROGRESS**.

## Input Hasil Produksi

1. Dari detail SPK, klik tab **Output**.
2. Input:
   - **Quantity Output** = jumlah produk jadi.
   - **Quantity Reject** = jumlah produk cacat (jika ada).
3. Klik **Selesai Produksi** → status berubah **COMPLETED**.

## Backflush

- Jika BOM dikonfigurasi untuk backflush, bahan baku otomatis terpotong saat produksi selesai.
- Jika backflush gagal (stok bahan kurang), cek error dan top up stok bahan baku.

## Tips

- Pastikan BOM sudah benar sebelum membuat SPK.
- Catat reject dan alasan di field **Notes** untuk quality control.`,
    modules: ['production'],
    tags: ['spk', 'produksi', 'batch', 'cara-pakai'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-input-hasil-kiosk',
    title: 'Cara Input Hasil Produksi via Kiosk',
    summary: 'Panduan menginput hasil produksi langsung dari mesin kiosk di lantai pabrik.',
    bodyMd: `## Akses Kiosk

1. Buka browser di tablet/PC kiosk.
2. Akses URL kiosk (biasanya: \`yourcompany.polyflow.uk/kiosk\`).
3. Login dengan akun kiosk atau scan badge karyawan.

## Input Hasil

1. Pilih **SPK** yang sedang berjalan dari daftar.
2. Input **Quantity Output** (jumlah produk jadi).
3. Input **Quantity Reject** jika ada produk cacat.
4. Pilih **Alasan Reject** dari dropdown (jika tersedia).
5. Klik **Submit**.

## Tips

- Input bisa dilakukan berkali-kali selama shift berjalan.
- Total output diakumulasi di SPK.
- Untuk melihat ringkasan, buka menu **Production** → **Production Orders** → detail SPK.

## Troubleshooting

- **Kiosk tidak bisa diakses** → pastikan tablet terhubung ke jaringan yang sama dengan server.
- **SPK tidak muncul** → pastikan SPK sudah berstatus **IN_PROGRESS**.`,
    modules: ['production'],
    tags: ['kiosk', 'produksi', 'input-hasil', 'cara-pakai'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'error-backflush-atau-stok-bahan',
    title: 'Error Backflush / Stok Bahan Baku Kurang',
    summary: 'Solusi ketika proses backflush gagal karena stok bahan baku tidak mencukupi.',
    bodyMd: `## Penyebab Error

Error **"Backflush Failed"** atau **"Material Stock Insufficient"** terjadi ketika:
- Produksi selesai tapi stok bahan baku di gudang kurang dari kebutuhan BOM.
- BOM membutuhkan bahan X sejumlah Y, tapi stok X < Y.

## Langkah Cek

1. Buka detail SPK → tab **Materials**.
2. Periksa **Required Qty** vs **Available Qty** untuk setiap bahan.
3. Buka menu **Warehouse** → **Inventory** untuk cek stok aktual bahan baku.

## Solusi

### Opsi 1: Top up stok bahan baku
- Lakukan penerimaan barang (Incoming) untuk bahan yang kurang.
- Setelah stok bertambah, klik **Retry Backflush** di detail SPK.

### Opsi 2: Manual stock adjustment
- Jika stok fisik ada tapi data tidak sinkron, lakukan **Stock Adjustment** di menu **Warehouse** → **Inventory** → **Adjustment**.
- Setelah adjustment, retry backflush.

### Opsi 3: Edit BOM
- Jika BOM salah (terlalu banyak bahan), edit BOM di menu **Production** → **BOM**.
- Setelah BOM benar, retry backflush.

## Pencegahan

- Cek ketersediaan bahan baku sebelum mulai produksi.
- Atur **Minimum Stock Alert** untuk bahan baku kritis.`,
    modules: ['production', 'warehouse'],
    tags: ['backflush', 'bahan-baku', 'stok-kurang', 'troubleshoot'],
    errorCodes: ['MATERIAL_INSUFFICIENT', 'BACKFLUSH_FAILED'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-lihat-invoice-belum-lunas',
    title: 'Cara Melihat Invoice yang Belum Lunas',
    summary: 'Panduan melihat daftar invoice customer yang masih outstanding atau overdue.',
    bodyMd: `## Langkah-langkah

1. Buka menu **Finance** → **Invoices** (atau **Sales Invoices**).
2. Gunakan filter **Status**:
   - **Unpaid** = belum ada pembayaran sama sekali.
   - **Partial** = sudah dibayar sebagian.
   - **Overdue** = sudah jatuh tempo tapi belum lunas.
3. Tabel menampilkan:
   - **Nomor Invoice**.
   - **Customer**.
   - **Total Amount**.
   - **Paid Amount**.
   - **Sisa Tagihan** = Total - Paid.
   - **Jatuh Tempo**.

## Filter Tambahan

- **Per Customer**: ketik nama customer di filter.
- **Per Tanggal**: pilih rentang tanggal invoice.
- **Per Sales Order**: filter berdasarkan SO terkait.

## Tindakan

- Klik invoice untuk melihat detail.
- Untuk catat pembayaran, klik **Record Payment** dari detail invoice.
- Kirim reminder ke customer dengan tombol **Send Reminder** (jika terkonfigurasi).

## Tips

- Cek rutin invoice overdue setiap minggu untuk penagihan.
- Gunakan **Export** untuk laporan piutang ke Excel.`,
    modules: ['finance'],
    tags: ['invoice', 'piutang', 'belum-lunas', 'finance'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'error-period-locked-finance',
    title: 'Error Period Locked di Finance',
    summary: 'Solusi ketika transaksi finance gagal karena periode akuntansi sudah dikunci.',
    bodyMd: `## Penyebab Error

Error **"Period Locked"** atau **"Posting Period Closed"** muncul ketika:
- Anda mencatat transaksi (invoice, payment, journal) di periode yang sudah dikunci.
- Admin finance sudah menutup periode akuntansi tersebut.

## Langkah Cek

1. Buka menu **Finance** → **Accounting** → **Period Locks** (atau **Settings**).
2. Periksa periode mana yang sudah dikunci.

## Solusi

### Opsi 1: Gunakan periode yang masih buka
- Ubah tanggal transaksi ke periode yang masih terbuka.
- Klik **Simpan** ulang.

### Opsi 2: Minta admin buka periode
- Hubungi admin finance untuk membuka sementara periode yang terkunci.
- Setelah transaksi diproses, admin mengunci kembali periode tersebut.

## Pencegahan

- Catat transaksi tepat waktu — jangan menumpuk di akhir periode.
- Sebelum tutup buku, pastikan semua transaksi sudah diproses.

## Catatan

- Period Lock ada untuk mencegah perubahan data di periode yang sudah di-audit.
- Jangan minta admin membuka periode terlalu sering — ini hanya untuk kasus darurat.`,
    modules: ['finance'],
    tags: ['period-locked', 'tutup-buku', 'accounting', 'troubleshoot'],
    errorCodes: ['PERIOD_LOCKED', 'POSTING_PERIOD_CLOSED'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-atur-role-permission-user',
    title: 'Cara Atur Role & Permission User',
    summary: 'Panduan mengatur role dan permission untuk mengontrol akses user ke menu dan fitur.',
    bodyMd: `## Konsep

- **Role** = kumpulan permission (misal: "Admin Gudang", "Sales Staff", "Finance").
- **Permission** = izin akses ke menu/fitur spesifik (misal: "Buat Sales Order", "Lihat Inventory").
- Satu user bisa punya **banyak role**.

## Langkah Atur Role

1. Buka menu **Settings** → **Users** (atau **Access Control**).
2. Klik tab **Roles**.
3. Klik **+ Role Baru** untuk membuat role baru, atau klik role yang ada untuk edit.
4. Atur permission:
   - Centang permission yang ingin diberikan.
   - Permission dikelompokkan per modul (Sales, Warehouse, Production, dll).
5. Klik **Simpan**.

## Assign Role ke User

1. Buka menu **Settings** → **Users**.
2. Klik user yang ingin diatur.
3. Di tab **Roles**, pilih role yang akan diberikan.
4. Klik **Simpan**.

## Permission Umum

| Role | Akses |
|------|-------|
| Admin | Semua menu + settings |
| Sales Staff | Sales Order, Customer, Delivery |
| Warehouse Staff | Inventory, Incoming, Outgoing |
| Finance Staff | Invoice, Payment, Accounting |
| Production Staff | SPK, BOM, Kiosk |

## Tips

- Jangan beri **Admin** role ke semua orang — gunakan role spesifik.
- Jika user bilang "menu tidak muncul", cek apakah role-nya punya permission yang benar.`,
    modules: ['access'],
    tags: ['role', 'permission', 'user', 'akses'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'menu-tidak-muncul-permission',
    title: 'Menu Tidak Muncul? Cek Permission',
    summary: 'Solusi ketika user tidak bisa melihat menu tertentu di Polyflow.',
    bodyMd: `## Penyebab

Menu tidak muncul biasanya karena:
1. **Role tidak punya permission** untuk menu tersebut.
2. **User belum di-assign role** yang benar.
3. **Fitur butuh akses desktop** (beberapa menu tidak tersedia di mobile).

## Langkah Cek

### Cek Permission Sendiri
1. Buka menu **Settings** → **My Profile** (atau klik nama di pojok kanan atas).
2. Lihat tab **Roles & Permissions** — daftar permission aktif Anda.

### Minta Admin Cek
1. Hubungi admin / super-admin.
2. Minta cek role Anda di menu **Settings** → **Users** → [Nama Anda].

## Solusi

1. **Tidak ada permission** → minta admin tambahkan role yang sesuai.
2. **Role salah** → minta admin assign role yang benar.
3. **Menu mobile** → beberapa menu (misal: Accounting, BOM editing) hanya tersedia di desktop. Buka Polyflow di browser desktop/PC.

## Tips untuk Admin

- Gunakan role template (Admin, Sales Staff, Warehouse Staff, dll) untuk konsistensi.
- Jangan buat role terlalu granular — susah dikelola.
- Review permission secara berkala (quarterly).`,
    modules: ['access'],
    tags: ['menu-tidak-muncul', 'permission', 'akses', 'troubleshoot'],
    errorCodes: ['PERMISSION_DENIED', 'ACCESS_DENIED'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'apa-yang-bisa-virtual-cs',
    title: 'Apa yang Bisa & Tidak Bisa Virtual CS?',
    summary: 'Panduan tentang kemampuan dan batasan Virtual CS Polyflow.',
    bodyMd: `## Yang Bisa Virtual CS Lakukan

### Cek Data Operasional
- Cek stok produk di gudang.
- Lihat Sales Order yang sedang pending.
- Cek status produksi (SPK aktif).
- Ringkasan finance (piutang / hutang).

### Panduan Penggunaan
- Cara membuat Sales Order, PO, SPK, Invoice.
- Cara terima barang, outgoing, stock opname.
- Cara atur role dan permission.
- Troubleshooting error umum.

### Pencarian Knowledge Base
- Mencari artikel panduan sesuai pertanyaan Anda.
- Memberikan link ke artikel yang relevan.

## Yang TIDAK Bisa Virtual CS Lakukan

### Tidak Bisa Ubah Data
- Tidak bisa membuat / mengedit / menghapus transaksi.
- Tidak bisa konfirmasi SO, proses delivery, atau ubah stok.
- Semua perubahan data harus dilakukan lewat UI Polyflow.

### Tidak Bisa Akses Data Sensitif
- Tidak bisa melihat password atau data pribadi user lain.
- Tidak bisa melihat data tenant lain.

### Tidak Bisa Jawab Non-Operasional
- Tidak bisa menjawab pertanyaan di luar konteks pabrik / ERP.
- Tidak bisa memberikan saran investasi, politik, dll.

## Cara Terbaik Bertanya

- **Spesifik**: "Cek stok MP 15" lebih baik dari "cek stok".
- **Sebut nama/ID**: "Status SO-2026-0001" lebih cepat dari "SO Budi".
- **Cara pakai**: "Cara buat Sales Order?" akan mengutip artikel KB.`,
    modules: ['global'],
    tags: ['virtual-cs', 'bantuan', 'cara-pakai', 'faq'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-beri-feedback-dan-eskalasi',
    title: 'Cara Beri Feedback & Eskalasi ke Tim Support',
    summary: 'Panduan memberikan feedback ke Virtual CS dan cara eskalasi jika butuh bantuan lebih.',
    bodyMd: `## Feedback ke Virtual CS

Setelah Virtual CS menjawab pertanyaan Anda:
- Klik **👍** jika jawaban membantu.
- Klik **👎** jika jawaban kurang tepat / tidak membantu.
- Feedback Anda membantu meningkatkan kualitas jawaban.

## Eskalasi ke Tim Support

Jika Virtual CS tidak bisa menjawab atau Anda butuh bantuan lebih:

### Opsi 1: Chat dengan Context
- Lanjutkan percakapan di chat Virtual CS.
- Jelaskan masalah Anda dengan detail.
- Virtual CS akan mencoba membantu atau mengarahkan ke artikel yang tepat.

### Opsi 2: Hubungi Admin
- Hubungi admin perusahaan Anda untuk bantuan langsung.
- Admin bisa mengubah data, atur permission, atau troubleshoot masalah teknis.

### Opsi 3: Lihat Knowledge Base
- Buka menu **Support** → **Cara Pakai** atau **Troubleshooting**.
- Cari artikel sesuai masalah Anda.

## Tips Eskalasi

- **Sertakan detail**: nomor order, nama produk, screenshot error.
- **Jelaskan sudah coba apa**: "Sudah cek stok tapi masih error".
- **Sebutkan urgency**: mendesak atau bisa ditunggu.`,
    modules: ['global'],
    tags: ['feedback', 'eskalasi', 'support', 'cara-pakai'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
];

async function seedHelpArticles() {
  console.log('Seeding help articles...');

  for (const article of seedArticles) {
    const existing = await mainDb.helpArticle.findUnique({
      where: { slug: article.slug },
    });

    if (existing) {
      console.log(`  [SKIP] ${article.slug} (already exists)`);
      continue;
    }

    await mainDb.helpArticle.create({
      data: {
        ...article,
        status: HelpArticleStatus.PUBLISHED,
        publishedAt: new Date(),
        version: 1,
      },
    });

    console.log(`  [OK] ${article.slug}`);
  }

  const total = await mainDb.helpArticle.count();
  console.log(`\nDone. Total articles in DB: ${total}`);
}

seedHelpArticles()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => mainDb.$disconnect());
