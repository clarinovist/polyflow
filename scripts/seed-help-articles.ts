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
    summary: 'Panduan membuat Sales Order (SO) baru di Polyflow, memilih jenis pesanan (Stok, Produksi, atau Maklon), menentukan gudang sumber, serta mengecek limit kredit customer.',
    bodyMd: `## Langkah-Langkah Membuat Sales Order

1. Buka menu **Penjualan → Sales Order**. Klik tombol **Pesanan Baru** di pojok kanan atas.
2. Pilih jenis pesanan:
   - **Kirim dari Stok**: Barang sudah tersedia di gudang dan siap dikirim.
   - **Produksi Dulu**: Barang perlu diproduksi terlebih dahulu setelah pesanan dikonfirmasi.
   - **Maklon Jasa**: Pesanan pengerjaan jasa atau maklon khusus item tipe Service.
3. Isi formulir pesanan:
   - **Customer**: Ketik nama customer di kolom pencarian. Jika belum terdaftar, klik **Tambah Customer Baru**.
   - **Gudang Sumber**: Pilih gudang asal barang. (Wajib diisi sebelum pesanan dikonfirmasi).
   - **Tanggal Pesanan**: Default adalah hari ini.
   - **Catatan**: Isi dengan catatan internal jika ada instruksi khusus.
4. Tambahkan item produk:
   - Klik **+ Tambah Item**.
   - Cari dan pilih produk yang dipesan.
   - Isi **Jumlah** (Qty) dan **Harga Satuan**. Harga akan terisi otomatis jika ada daftar harga khusus customer.
   - Atur **Diskon** (persen atau nominal) serta status **Pajak** (PPN) jika berlaku.
   - Ulangi untuk setiap item produk tambahan.
5. Periksa indikator **Limit Kredit** customer di atas formulir:
   - Jika berwarna merah, total pesanan akan melebihi batas kredit customer. Kurangi kuantitas pesanan atau koordinasikan dengan Admin untuk menaikkan limit kredit.
6. Klik **Simpan**. Pesanan baru akan tersimpan dengan status **Draft**.

## Alur Setelah Menyimpan Draft SO

Setelah tersimpan sebagai **Draft**, Anda dapat melakukan tindakan berikut dari halaman detail SO:
- **Konfirmasi Order**: Mengubah status pesanan menjadi **Terkonfirmasi** (Confirmed) dan mereservasi stok di gudang.
- **Edit**: Mengubah rincian item, jumlah, atau informasi customer selama pesanan masih berstatus Draft.
- **Hapus**: Menghapus draft pesanan yang tidak jadi diproses.
- **Buat Surat Jalan**: Membuat dokumen pengiriman setelah pesanan dikonfirmasi.
- **Tambah ke Jadwal**: Memasukkan pesanan ke dalam jadwal pengiriman mingguan.

## Pertanyaan Umum & Troubleshooting

- **Muncul pesan "Source location is required"**: Edit pesanan dan pastikan kolom Gudang Sumber sudah dipilih.
- **Error CREDIT_LIMIT_EXCEEDED**: Batas kredit customer tidak mencukupi. Minta Admin menaikkan limit kredit di menu **Penjualan → Customer** atau sesuaikan nilai pesanan.
- **Produk tidak muncul di pencarian**: Pastikan varian produk dalam status aktif pada menu Katalog Produk.
- **Invoice tidak bisa dibuat**: Pastikan Sales Order sudah berstatus **Dikirim** (Shipped/Delivered) dan terhubung dengan customer yang valid.
`,
    modules: ['sales'],
    tags: ['sales-order', 'so', 'pesanan-baru'],
    errorCodes: ['CREDIT_LIMIT_EXCEEDED'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-confirm-so-stok-kurang',
    title: 'Cara Konfirmasi SO Saat Stok Tidak Mencukupi',
    summary: 'Panduan mengonfirmasi Sales Order ketika stok gudang kurang. Sistem akan mereservasi stok yang ada dan otomatis memasukkan kekurangan ke antrean produksi.',
    bodyMd: `## Mekanisme Konfirmasi SO Saat Stok Kurang

Saat Anda mengonfirmasi Sales Order (SO) dan stok di gudang sumber tidak mencukupi, sistem Polyflow tidak akan memblokir transaksi secara keras, melainkan menjalankan mekanisme otomatis:

1. Buka detail Sales Order berstatus **Draft**, lalu klik **Konfirmasi Order**.
2. Sistem memeriksa ketersediaan stok fisik di gudang sumber:
   - **Jika stok cukup**: Status berubah menjadi **Terkonfirmasi** (Confirmed) dan stok langsung direservasi untuk pesanan ini.
   - **Jika stok kurang namun ada BOM (resep produk)**: Status SO berubah menjadi **Dalam Produksi** (In Production). Jumlah stok yang tersedia akan direservasi, sedangkan kekurangannya dimasukkan ke **Produksi → Permintaan FG**.
3. Peringatan sistem akan muncul memberitahukan bahwa kekurangan stok telah dimasukkan ke antrean permintaan produksi.

## Opsi Solusi Memenuhi Kekurangan Stok

### Opsi 1: Buat Perintah Kerja (SPK) dari Permintaan FG (Direkomendasikan)
1. Buka menu **Produksi → Permintaan FG**.
2. Cari item produk pesanan yang kekurangan stok, lalu klik **Buat SPK**.
3. Isi parameter produksi (mesin, jumlah target, lokasi hasil) lalu rilis SPK. Setelah produksi selesai, stok barang jadi akan bertambah dan siap dikirim.

### Opsi 2: Kurangi Kuantitas Pesanan
1. Edit Sales Order saat masih berstatus **Draft**.
2. Kurangi kuantitas item agar sesuai dengan stok fisik yang tersedia saat ini.
3. Simpan dan konfirmasi ulang pesanan.

### Opsi 3: Cek Penerimaan Barang Masuk (PO Supplier)
1. Buka menu **Stok → Penerimaan Barang** untuk memeriksa apakah ada barang masuk dari supplier yang sedang menunggu diproses.
2. Selesaikan penerimaan barang terlebih dahulu agar stok fisik bertambah.

## Troubleshooting Error & Peringatan

- **Peringatan FG_DEMAND_QUEUED**: Informasi bahwa kekurangan barang berhasil dialokasikan ke antrean produksi (bukan error).
- **Error MISSING_DEFAULT_BOM**: Produk kekurangan stok tetapi belum memiliki resep (BOM) default. Buat resep produk terlebih dahulu di menu Katalog Produk / BOM.
- **Error CREDIT_LIMIT_EXCEEDED**: Batas kredit customer terlampaui. Naikkan limit kredit di data customer atau kurangi kuantitas SO.
`,
    modules: ['sales', 'warehouse', 'production'],
    tags: ['stok-kurang', 'confirm-so', 'reservasi', 'permintaan-fg'],
    errorCodes: ['CREDIT_LIMIT_EXCEEDED', 'MISSING_DEFAULT_BOM', 'FG_DEMAND_QUEUED', 'WO_CREATE_FAILED'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-jadwal-kirim-dan-surat-jalan',
    title: 'Cara Atur Jadwal Kirim & Buat Surat Jalan',
    summary: 'Panduan membuat jadwal pengiriman mingguan armada serta alur penerbitan dan eksekusi Surat Jalan (Delivery Order) dari Penjualan hingga Gudang.',
    bodyMd: `## Menghubungkan Penjualan dan Gudang

Pengiriman barang di Polyflow terbagi menjadi dua tahap utama:
- **Penjualan (Sales)**: Menentukan jadwal pengiriman dan menerbitkan dokumen Surat Jalan (Delivery Order).
- **Gudang (Warehouse)**: Melakukan verifikasi muat barang fisik dan mengonfirmasi keberangkatan armada.

---

## 1. Mengatur Jadwal Pengiriman Mingguan

1. Buka menu **Penjualan → Jadwal Kirim**.
2. Klik tombol **Jadwal Baru**. Pilih tanggal acuan untuk minggu pengiriman yang akan dibuat (sistem otomatis menentukan periode Senin hingga Minggu).
3. Buka detail jadwal pengiriman untuk menambahkan armada kendaraan, sopir, serta mendaftarkan pesanan (SO) yang akan dikirim pada trip tersebut.
4. Urutkan titik penghentian (stops) rute harian armada sesuai lokasi customer.

---

## 2. Membuat Surat Jalan (Delivery Order)

1. Buka detail Sales Order yang sudah berstatus **Terkonfirmasi** atau **Dalam Produksi**.
2. Klik tombol **Buat Surat Jalan**.
3. Masukkan kuantitas item yang akan dikirim pada pengiriman ini (bisa pengiriman parsial/bertahap sesuai sisa pesanan).
4. Klik **Simpan**. Surat Jalan baru diterbitkan dengan status awal **Draft / Menunggu** (Pending).
   - *Catatan:* Pada status Draft/Menunggu, stok barang di gudang **belum dipotong**.

---

## 3. Eksekusi Muat Barang oleh Tim Gudang

1. Tim Gudang membuka menu **Stok → Antrian Muat**.
2. Cari Surat Jalan yang bersangkutan, lalu klik tombol **Mulai Muat** (status berubah menjadi *Sedang Dimuat*).
3. Petugas gudang menghitung kuantitas barang fisik yang dimuat ke dalam armada:
   - Jika kuantitas fisik sesuai dengan perintah Surat Jalan, klik **Samakan Semua ke Perintah**.
   - Jika ada selisih, sesuaikan kuantitas pada kolom verifikasi.
4. Klik **Simpan Verifikasi**, kemudian klik **Kunci Verifikasi**.
5. Setelah verifikasi dikunci, klik **Tandai Dikirim**.
   - Pada tahap ini, stok barang di gudang **resmi terpotong** dan sistem otomatis menyiapkan draf invoice penjualan.

---

## Pembatalan dan Retur Surat Jalan

- **Sebelum Dikirim (Status Menunggu / Sedang Dimuat)**: Klik tombol **Batalkan** di halaman detail Surat Jalan untuk membatalkan proses muat. Stok tidak terpotong.
- **Setelah Dikirim (Status Dikirim / Dalam Perjalanan)**: Dokumen Surat Jalan tidak dapat diubah lagi. Jika terjadi penolakan barang di lapangan, gunakan menu **Penjualan → Retur Penjualan**.
`,
    modules: ['sales', 'warehouse'],
    tags: ['surat-jalan', 'jadwal-kirim', 'delivery-order', 'antrian-muat'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-terima-barang-gudang',
    title: 'Cara Terima Barang di Gudang (Incoming)',
    summary: 'Panduan mencatat penerimaan barang masuk di gudang dari Purchase Order (PO) supplier maupun penerimaan langsung dari nota/walk-in.',
    bodyMd: `## Alur Penerimaan Barang Gudang

Penerimaan barang masuk (Incoming) bertugas mencatat fisik barang yang tiba di pabrik/gudang, memperbarui jumlah stok ketersediaan, serta menghitung kembali HPP/biaya rata-rata (Weighted Average Cost / WAC).

---

## Penerimaan Barang Berdasarkan Purchase Order (PO)

1. Buka menu **Stok → Penerimaan Barang**.
2. Pada bagian **Menunggu Diterima**, cari nomor PO supplier yang sedang diproses pengirimannya. Klik tombol **Terima Barang** (atau **Terima Sisa** jika penerimaan bertahap).
3. Pada halaman Formulir Penerimaan:
   - Pilih **Gudang Tujuan** penyimpanan barang.
   - Atur **Tanggal Penerimaan**.
   - Periksa daftar item barang: isi kolom **Qty Masuk** sesuai hasil perhitungan fisik di lokasi.
   - Isi **Biaya Satuan Aktual** jika terdapat penyesuaian biaya pengiriman atau harga per unit dari supplier.
4. Jika kuantitas fisik melebihi pesanan di PO, sistem akan menampilkan notifikasi *Over-Receipt*. Penerimaan tetap dapat disimpan dan stok akan bertambah sesuai fisik yang diterima.
5. Klik **Simpan Penerimaan Barang**.

---

## Penerimaan Barang Tanpa PO (Penerimaan dari Nota / Walk-in)

1. Buka menu **Stok → Penerimaan Barang**.
2. Klik tombol **Terima dari Nota** di sudut kanan atas.
3. Pilih Supplier dan Gudang Tujuan.
4. Masukkan nama produk/varian, jumlah fisik yang diterima, serta harga satuan nota.
5. Klik **Simpan**. Transaksi akan tercatat sebagai penerimaan nota langsung.

---

## Efek Penerimaan Barang Terhadap Sistem

- **Stok Gudang**: Jumlah fisik barang di gudang tujuan otomatis bertambah.
- **Nilai Inventaris (WAC)**: Nilai HPP rata-rata produk diperbarui berdasarkan harga satuan aktual barang masuk.
- **Status PO**: Status Purchase Order berubah otomatis menjadi **Diterima Sebagian** (Partial) atau **Selesai Diterima** (Received).
`,
    modules: ['warehouse', 'purchasing'],
    tags: ['incoming', 'penerimaan', 'po', 'barang-masuk'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-cek-stok-per-lokasi',
    title: 'Cara Cek Stok Per Lokasi Gudang',
    summary: 'Panduan memantau tingkat stok barang fisik, stok terpesan (reservasi), stok tersedia, lokasi penyimpanan, serta riwayat mutasi barang.',
    bodyMd: `## Memahami Indikator Stok di Polyflow

Buka menu **Stok → Stok** untuk melihat seluruh saldo persediaan barang di pabrik. Kolom utama yang perlu diperhatikan:

- **Stok Fisik**: Jumlah total barang yang berada secara riil di lokasi gudang.
- **Terpesan (Reservasi)**: Jumlah barang yang sudah diikat oleh Sales Order (SO) yang telah dikonfirmasi namun belum dikirim.
- **Tersedia**: Jumlah barang yang bebas untuk dijual atau dipakai produksi (\`Tersedia = Stok Fisik - Terpesan\`).
- **Nilai Stok**: Estimasi nilai aset persediaan berdasarkan HPP/WAC terkini (akses kolom harga dapat diatur via izin peran pengguna).

---

## Menapis Stok Berdasarkan Lokasi Gudang

1. Gunakan **Navigator Gudang** di bagian atas tabel untuk memilih lokasi tertentu (misalnya: *Gudang Bahan Baku A*, *Gudang Barang Jadi*, atau *Gudang Staging*).
2. Anda dapat memilih beberapa gudang sekaligus (multi-select) untuk melihat akumulasi stok di area tersebut.
3. Pilih opsi **Semua Gudang** jika ingin melihat total agregat persediaan di seluruh pabrik.

---

## Memeriksa Stok Menipis & Peringatan Reorder

1. Klik filter **Stok Menipis** di atas tabel.
2. Sistem akan menyaring produk-produk yang jumlah ketersediaannya sudah berada di bawah batas **Minimum Stok Alert** yang ditentukan pada Katalog Produk.
3. Segera koordinasikan dengan tim Pembelian (untuk bahan baku) atau tim Produksi (untuk barang jadi) untuk melakukan pemesanan ulang (*reorder*).

---

## Melihat Riwayat Mutasi & Detail Produk

1. Klik pada baris produk yang ingin diinspeksi.
2. Anda akan diarahkan ke halaman detail produk untuk melihat:
   - Rincian sebaran stok di setiap lokasi gudang.
   - Grafis tren pergerakan stok.
   - **Riwayat Mutasi**: Catatan lengkap barang masuk (penerimaan), barang keluar (pengiriman/pemakaian SPK), penyesuaian (*adjustment*), dan transfer antar gudang.
`,
    modules: ['warehouse'],
    tags: ['stok', 'inventory', 'lokasi', 'stok-menipis'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-outgoing-muat-kirim',
    title: 'Cara Proses Outgoing & Muat Kirim Gudang',
    summary: 'Panduan operasional tim gudang dalam mengelola antrean perintah muat (Surat Jalan), verifikasi kuantitas muat fisik, serta pemotongan stok otomatis.',
    bodyMd: `## Peran Gudang dalam Pengiriman Outgoing

Semua instruksi pengiriman barang yang dibuat oleh Sales berupa Surat Jalan (Delivery Order) akan masuk ke antrean kerja gudang. Tim gudang bertugas memastikan fisik barang yang dimuat sesuai dengan dokumen resmi sebelum armada berangkat.

---

## Langkah Operasional Muat Barang

1. Buka menu **Stok → Antrian Muat**.
2. Daftar Surat Jalan berstatus **Menunggu** (Pending) dan **Sedang Dimuat** (Loading) akan ditampilkan.
3. Klik pada Surat Jalan yang akan dimuat, lalu klik **Mulai Muat**.
4. Lakukan penghitungan fisik barang yang dimasukkan ke atas kendaraan:
   - Jika kuantitas fisik tepat sama dengan Surat Jalan, klik tombol **Samakan Semua ke Perintah**.
   - Jika terdapat perbedaan kuantitas (misalnya armada tidak muat atau stok kurang), edit kuantitas pada baris item yang bersangkutan.
5. Klik **Simpan Verifikasi**, lalu klik **Kunci Verifikasi**.
6. Klik tombol **Tandai Dikirim**:
   - Sistem akan memotong stok gudang secara permanen.
   - Dokumen pengiriman resmi diperbarui menjadi status **Dikirim** (Shipped).
7. Unggah foto kendaraan muat dan dokumen bukti terima barang (POD) setelah pengiriman selesai.

---

## Mengatasi Kendala Stok Kurang Saat Muat

Jika saat verifikasi muat stok fisik ternyata tidak cukup:
- Periksa apakah ada barang jadi hasil produksi yang belum dicatatkan di SPK.
- Jika barang memang belum ada, sesuaikan kuantitas muat Surat Jalan ke kuantitas yang benar-benar siap dikirim. Sisa pesanan SO yang belum terkirim dapat dibuatkan Surat Jalan susulan pada pengiriman berikutnya.
`,
    modules: ['warehouse', 'sales'],
    tags: ['outgoing', 'antrian-muat', 'verifikasi-muat', 'surat-jalan'],
    errorCodes: ['STOCK_INSUFFICIENT'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-spk-batch-harian',
    title: 'Cara Buat Perintah Kerja (SPK) Batch Produksi',
    summary: 'Panduan membuat Surat Perintah Kerja (SPK) batch produksi harian, memilih resep BOM, menentukan lokasi hasil, serta mengelola alur status SPK.',
    bodyMd: `## Alur Status Perintah Kerja (SPK)

Perintah Kerja Produksi (SPK) di Polyflow melewati alur status berikut:
- **Draft**: Draf SPK baru dibuat, belum dirilis ke lantai produksi.
- **Menunggu Bahan**: SPK membutuhkan bahan baku yang stoknya saat ini belum mencukupi.
- **Siap Produksi (Released)**: Bahan tersedia dan SPK siap dikerjakan oleh operator.
- **Sedang Diproduksi (In Progress)**: Pengerjaan fisik produksi sedang berlangsung di mesin.
- **Produksi Selesai (Completed)**: Target produksi telah dicapai dan hasil dicatatkan.
- **Dibatalkan (Cancelled)**: SPK dibatalkan sebelum proses produksi berjalan.

---

## Langkah-Langkah Membuat SPK Baru

1. Buka menu **Produksi → SPK**, lalu klik **Buat SPK**.
2. **Tahap 1 — Spesifikasi Produksi**:
   - Pilih **Produk** yang akan diproduksi.
   - Pilih **Resep / Formulasi (BOM)** yang digunakan.
   - Tentukan **Mesin** dan **Tanggal Rencana Produksi**.
   - Isi **Target Kuantitas** (dalam jumlah batch atau satuan unit barang).
3. **Tahap 2 — Lokasi & Alokasi**:
   - Pilih **Lokasi Output** (gudang staging atau gudang barang jadi tempat menampung hasil).
   - Jika pesanan berupa pengerjaan Maklon, centang opsi Maklon dan pilih nama Customer.
4. **Tahap 3 — Peninjauan (Review)**:
   - Periksa ringkasan kebutuhan bahan baku yang akan dikonsumsi.
   - Jika stok bahan baku tersedia, klik **Buat SPK**. Status SPK akan tersimpan sebagai **Draft** atau **Siap Produksi**.
   - Jika bahan kurang, status akan tersimpan sebagai **Menunggu Bahan**.

---

## Menjalankan dan Menyelesaikan SPK

1. **Rilis SPK**: Di halaman detail SPK, klik tombol **Rilis SPK** untuk mengubah status menjadi Siap Produksi.
2. **Mulai Produksi**: Operator atau Supervisor klik **Mulai Produksi** saat mesin mulai beroperasi.
3. **Catat Hasil Produksi**: Isi kuantitas barang bagus (*good output*) dan scrap/affal jika ada (dapat dilakukan dari web admin atau terminal Kiosk operator).
4. **Selesaikan SPK**: Klik **Selesai SPK** setelah seluruh target produksi selesai diproses.
`,
    modules: ['production'],
    tags: ['spk', 'work-order', 'batch', 'produksi', 'bom'],
    errorCodes: ['MATERIAL_INSUFFICIENT', 'BACKFLUSH_FAILED'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-input-hasil-kiosk',
    title: 'Cara Input Hasil Produksi via Terminal Kiosk',
    summary: 'Panduan bagi operator pabrik dalam menggunakan terminal Kiosk layar sentuh untuk memilih SPK, memulai pekerjaan, dan mencatat hasil output produksi.',
    bodyMd: `## Mengenal Terminal Kiosk Operator

Terminal Kiosk (\`/kiosk\`) adalah antarmuka khusus yang dirancang untuk perangkat tablet atau layar sentuh di area pabrik. Operator dapat mencatat aktivitas produksi harian secara cepat tanpa perlu membuka menu admin yang kompleks.

---

## Langkah-Langkah Menggunakan Kiosk

### 1. Sesi Login Operator
1. Buka halaman Kiosk di tablet mesin/lantai produksi.
2. Pilih nama **Operator** dari daftar yang tersedia.
3. Nama operator yang aktif akan terpampang di sudut layar.

### 2. Memilih dan Memulai Pekerjaan (SPK)
1. Pilih menu **Produksi / SPK**.
2. Layar akan menampilkan daftar SPK yang ditugaskan pada mesin tempat operator bekerja (status *Siap Produksi* atau *Sedang Diproduksi*).
3. Pilih SPK yang sesuai, lalu tekan tombol **Mulai SPK**.

### 3. Mencatat Hasil Produksi (Output & Scrap)
1. Tekan tombol **Catat Hasil**.
2. Ikuti langkah wizard pada layar:
   - **Langkah 1 — Jumlah Bagus**: Masukkan kuantitas barang jadi / roll yang berhasil diproduksi.
   - **Langkah 2 — Scrap / Affal**: Masukkan berat afalan (prongkol, daun, atau sisa potongan) jika ada. Jika tidak ada scrap, tekan *Lewati*.
   - **Langkah 3 — Foto Bukti**: Ambil foto sampel barang hasil produksi (opsional).
   - **Langkah 4 — Konfirmasi**: Periksa ringkasan lalu tekan **Kirim Hasil**.
3. Hasil produksi langsung tercatat secara *real-time*, stok barang jadi otomatis bertambah, dan bahan baku terpotong secara otomatis (*backflush*).

---

## Troubleshooting Kiosk Operator

- **SPK tidak muncul di daftar Kiosk**: Pastikan SPK di bagian kantor perencanaan sudah dipindahkan dari status *Draft* menjadi **Siap Produksi** (*Released*), dan penugasan mesin SPK sesuai dengan mesin tempat operator login.
- **Sesi tertukar**: Jika berganti gilir kerja (shift), tekan tombol **Keluar Sesi** di pojok atas lalu pilih nama operator yang baru.
`,
    modules: ['production'],
    tags: ['kiosk', 'operator', 'catat-hasil', 'spk'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'error-backflush-atau-stok-bahan',
    title: 'Penyebab & Solusi Error Backflush / Stok Bahan Kurang',
    summary: 'Panduan penanganan saat pencatatan hasil produksi gagal akibat stok bahan baku kurang di lokasi sumber, serta langkah pemulihannya.',
    bodyMd: `## Pengertian Metode Backflush

Di Polyflow, konsumsi bahan baku dapat dikonfigurasi untuk terhitung secara otomatis (*Backflush*) sewaktu operator mencatatkan hasil output produksi. Sistem mengalokasikan pemakaian bahan secara proporsional sesuai rasio resep BOM.

Jika stok fisik bahan baku di lokasi sumber (gudang bahan atau lantai staging) lebih kecil dari kebutuhan rasio tersebut, sistem akan menampilkan peringatan stok bahan baku tidak mencukupi.

---

## Langkah-Langkah Penanganan

### 1. Cek Kebutuhan Bahan di Detail SPK
1. Buka menu **Produksi → SPK** dan masuk ke detail SPK yang bermasalah.
2. Buka tab **Bahan Baku (Materials)**.
3. Perhatikan kolom **Rencana**, **Terpakai**, dan **Selisih**:
   - Baris berwarna merah menunjukkan item bahan baku yang mengalami kekurangan stok.

### 2. Menambah Stok Bahan Baku di Gudang Sumber
Pilih salah satu cara pengisian persediaan berikut:
- **Penerimaan barang dari PO**: Terima barang masuk dari supplier via menu **Stok → Penerimaan Barang**.
- **Transfer antar gudang**: Pindahkan bahan dari gudang utama ke gudang staging produksi via menu **Stok → Transfer Stok**.
- **Penyesuaian stok (Adjustment)**: Jika secara fisik bahan baku sebenarnya ada di lokasi tetapi data sistem belum sesuai, lakukan penyesuaian via menu **Stok → Penyesuaian Stok**.

### 3. Mengajukan Pembelian Bahan Baru (Purchase Request)
Jika stok bahan di seluruh pabrik memang habis:
1. Di tab **Bahan Baku** pada detail SPK, klik tombol **Buat Permintaan Pembelian (PR)**.
2. Tim Pembelian akan menerima notifikasi kebutuhan bahan ini untuk diterbitkan Purchase Order (PO) ke supplier.

---

## Melanjutkan Pencatatan Produksi

Setelah stok bahan baku diisi kembali, buka kembali formulir pencatatan hasil produksi di SPK atau Kiosk, lalu simpan ulang. Sistem otomatis memproses pencatatan hasil dan konsumsi bahan baku secara sukses.
`,
    modules: ['production', 'warehouse'],
    tags: ['backflush', 'stok-kurang', 'bom', 'pemakaian-bahan'],
    errorCodes: ['MATERIAL_INSUFFICIENT', 'BACKFLUSH_FAILED'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-lihat-invoice-belum-lunas',
    title: 'Cara Melihat & Memantau Invoice Belum Lunas',
    summary: 'Panduan memantau tagihan piutang penjualan (AR) dan utang pembelian (AP), menyaring status invoice belum dibayar atau lewat jatuh tempo.',
    bodyMd: `## Memantau Tagihan dan Piutang Penjualan

Untuk memantau seluruh invoice penjualan kepada customer yang belum lunas atau sudah melewati tenggat waktu pembayaran:

1. Buka menu **Penjualan → Invoice & Piutang** atau **Finance → Invoice Sales**.
2. Di bagian atas halaman, perhatikan ringkasan kartu statistik:
   - **Belum Dibayar**: Menampilkan total nominal tagihan yang masih terbuka.
   - **Lewat Jatuh Tempo (Overdue)**: Menampilkan tagihan yang sudah melampaui tanggal jatuh tempo dan memerlukan tindakan penagihan.
3. Gunakan filter status di atas tabel:
   - **Belum Dibayar (Unpaid)**: Menampilkan invoice yang belum diangsur sama sekali.
   - **Dibayar Sebagian (Partial)**: Menampilkan invoice yang baru diangsur sebagian.
   - **Lewat Jatuh Tempo (Overdue)**: Menampilkan invoice yang tanggal jatuh temponya telah lewat.

---

## Pencatatan Pembayaran Tagihan (Terima Bayar)

1. Dari daftar invoice, klik pada baris invoice yang ingin dibayar.
2. Klik tombol **Terima Pembayaran** (atau buka menu **Finance → Terima Bayar**).
3. Isi tanggal penerimaan uang, akun kas/bank penerima, serta jumlah nominal pembayaran.
4. Klik **Simpan Pembayaran**.
   - Jika pembayaran lunas penuh, status invoice otomatis berubah menjadi **Lunas** (Paid).
   - Jika baru diangsur sebagian, status menjadi **Dibayar Sebagian** (Partial) dan sisa tagihan akan diperbarui.

---

## Menghapus atau Membatalkan Invoice

- Jika terdapat kesalahan input invoice, Anda dapat menghapus invoice selama belum ada transaksi pembayaran yang terkunci.
- Menghapus invoice secara otomatis membatalkan dan menghapus entri jurnal akuntansi yang terkait dari Buku Besar.
`,
    modules: ['finance', 'sales'],
    tags: ['invoice', 'piutang', 'utang', 'overdue', 'pembayaran'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'error-period-locked-finance',
    title: 'Penyebab & Solusi Error Period Locked di Finance',
    summary: 'Penjelasan error akibat memasukkan transaksi keuangan pada periode akuntansi yang sudah ditutup, serta langkah pembukaannya oleh admin.',
    bodyMd: `## Mengapa Error Period Locked Terjadi?

Error \`PERIOD_LOCKED\` atau \`POSTING_PERIOD_CLOSED\` terjadi apabila Anda mencoba membuat, mengubah, atau memposting transaksi keuangan (seperti Invoice Penjualan, Penerimaan Pembayaran, Pembayaran Supplier, atau Jurnal Umum) pada tanggal transaksi yang berada di dalam periode akuntansi yang sudah berstatus **Ditutup** (Closed / Locked).

Penutupan periode berfungsi untuk mengunci data pembukuan keuangan agar laporan laba rugi dan neraca periode lalu tidak berubah secara tidak sengaja.

---

## Cara Penanganan & Solusi

### Solusi 1: Ubah Tanggal Transaksi ke Periode Terbuka
Jika transaksi tersebut sebenarnya merupakan transaksi operasional periode berjalan, edit tanggal dokumen transaksi agar masuk ke dalam periode akuntansi yang masih **Terbuka** (Open).

### Solusi 2: Minta Admin Membuka Kembali Periode Fiskal
Jika transaksi memang harus dibukukan pada tanggal periode lalu:
1. Pengguna berwenang (Finance Admin) membuka menu **Finance → Periode Fiskal**.
2. Cari nama bulan/periode akuntansi yang dimaksud, lalu klik tombol **Buka Kembali**.
3. Setelah periode terbuka, lakukan simpan / posting pada transaksi yang sempat terkendala.
4. Setelah transaksi selesai diproses, Admin wajib mengklik tombol **Tutup Periode** kembali demi menjaga integritas data keuangan.

---

## Proses Penutupan Periode Akuntansi

Saat Admin menutup periode fiskal di menu **Finance → Periode Fiskal**, sistem akan secara otomatis membuat jurnal penutupan (*closing entry*) yang memindahkan saldo pendapatan dan beban ke akun **Laba Tahun Berjalan**.
`,
    modules: ['finance'],
    tags: ['period-locked', 'periode-fiskal', 'tutup-buku', 'keuangan'],
    errorCodes: ['PERIOD_LOCKED', 'POSTING_PERIOD_CLOSED'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-atur-role-permission-user',
    title: 'Cara Atur Role & Hak Akses (Permission) User',
    summary: 'Panduan bagi Admin dalam mengelola hak akses peran (role), mencentang modul pada pohon hak akses, dan menetapkan role kepada pengguna.',
    bodyMd: `## Konsep Kontrol Akses di Polyflow

Setiap pengguna di Polyflow dihubungkan dengan satu atau beberapa **Role (Peran)**. Hak akses terhadap fitur dan menu sistem diatur secara fleksibel melalui matriks modul pada pohon hak akses.

---

## 1. Mengatur Izin Fitur Pada Role (Pohon Hak Akses)

1. Buka menu **Pengaturan** (ikon roda gigi di sidebar), lalu klik tab **Kontrol Akses**.
2. Pilih Role yang ingin dikonfigurasi (misalnya: *Sales*, *Gudang*, *Operator*, *Finance*).
3. Gunakan tombol **Buka Semua** untuk menayangkan seluruh hirarki modul.
4. Centang kotak fitur atau menu yang ingin diizinkan untuk role tersebut.
   - Menghilangkan centang akan menyembunyikan menu dan memblokir akses ke fungsi terkait.
   - Opsi **Lihat Harga** merupakan izin khusus yang mengatur apakah role tersebut boleh melihat harga produk dan nilai persediaan.
5. Perubahan hak akses tersimpan secara **otomatis** sewaktu Anda mencentang/menghapus centang (tidak memerlukan tombol Simpan).

---

## 2. Menugaskan Role Kepada Pengguna (User)

1. Buka menu **Pengaturan** → tab **Pengguna**.
2. Cari nama pengguna yang ingin diubah, lalu klik **Edit**.
3. Pada pilihan Role, centang satu atau beberapa role yang sesuai untuk pengguna tersebut.
4. Klik **Simpan**.

---

## Catatan Penting Setelah Perubahan Akses

Pengguna yang sedang aktif menggunakan aplikasi mungkin memerlukan proses **Logout dan Login Ulang** agar perubahan hak akses dan menu baru ter-refresh sepenuhnya pada sesi mereka.
`,
    modules: ['access'],
    tags: ['role', 'permission', 'pengaturan', 'hak-akses'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'menu-tidak-muncul-permission',
    title: 'Penyebab Menu Tidak Muncul & Cara Mengatasinya',
    summary: 'Panduan mengatasi masalah menu atau tombol yang hilang akibat batasan hak akses role, sesi login yang belum diperbarui, atau perbedaan tampilan mobile.',
    bodyMd: `## Mengapa Menu atau Tombol Tidak Muncul?

Jika Anda atau staf Anda tidak dapat menemukan menu tertentu di sidebar atau tombol aksi pada halaman transaksi, hal ini umumnya disebabkan oleh salah satu dari 3 hal berikut:

1. **Role Pengguna Belum Diberi Izin Akses**: Pengguna belum diberikan hak akses ke jalur modul tersebut pada pengaturan Kontrol Akses.
2. **Sesi Login Belum Di-refresh**: Pengguna masih menggunakan sesi login lama sebelum Admin memperbarui izin hak aksesnya.
3. **Menu Khusus Tampilan Desktop**: Beberapa fitur komprehensif (seperti penyuntingan resep BOM atau jurnal keuangan rinci) didesain khusus untuk layar komputer/laptop dan sengaja disembunyikan pada tampilan aplikasi HP/Mobile.

---

## Langkah Penyelesaian

### Bagi Pengguna:
1. Lakukan **Logout** dari aplikasi, lalu lakukan **Login Ulang**.
2. Jika mengakses dari Smartphone, coba buka aplikasi menggunakan peramban (browser) di Komputer / Laptop.

### Bagi Admin Sistem:
1. Buka menu **Pengaturan → Pengguna**, periksa apakah pengguna tersebut sudah ditugaskan ke Role yang benar.
2. Buka tab **Kontrol Akses**, pilih Role pengguna tersebut.
3. Klik **Buka Semua**, lalu cari nama modul atau menu yang hilang.
4. Pastikan kotak centang modul dalam kondisi tercentang aktif.
5. Mintalah pengguna untuk Login Ulang.
`,
    modules: ['access'],
    tags: ['menu-tidak-muncul', 'permission', 'troubleshoot', 'hak-akses'],
    errorCodes: ['PERMISSION_DENIED', 'ACCESS_DENIED'],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'apa-yang-bisa-virtual-cs',
    title: 'Apa yang Bisa & Tidak Bisa Dilakukan Virtual CS?',
    summary: 'Penjelasan mengenai kapabilitas asisten kecerdasan buatan Virtual CS Polyflow dalam menjawab pertanyaan operasional dan batasan perlindungan data.',
    bodyMd: `## Mengenal Virtual CS Polyflow

Virtual CS adalah asisten pintar berbasis AI yang siap membantu Anda 24/7 di menu **Bantuan → Tanya Virtual CS** (atau langsung di \`/support/cs\`). Virtual CS dirancang khusus untuk memandu penggunaan sistem dan memberikan jawaban cepat terkait data operasional pabrik Anda.

---

## Hal-Hal yang Bisa Dilakukan Virtual CS

1. **Menjawab Panduan Penggunaan**: Memberikan langkah-langkah penggunaan fitur (misalnya: *"Bagaimana cara membuat Sales Order?"* atau *"Bagaimana cara input hasil produksi di Kiosk?"*).
2. **Memeriksa Status Data Operasional**:
   - Memeriksa tingkat persediaan barang (*"Berapa stok produk MP 15 di Gudang A?"*).
   - Memeriksa status pesanan (*"Berapa banyak SO yang berstatus belum dikirim?"*).
   - Memeriksa daftar pekerjaan produksi (*"Lihat SPK yang sedang berjalan di Mesin Extrusion 1"*).
   - Memeriksa informasi tagihan (*"Daftar invoice sales yang belum lunas"*).

---

## Batasan (Hal yang Tidak Bisa Dilakukan Virtual CS)

- **Tidak Bisa Mengubah atau Menghapus Data**: Virtual CS bersifat *Read-Only* (hanya membaca). Virtual CS tidak dapat membuatkan Sales Order, mengonfirmasi pengiriman, atau mengubah stok persediaan secara langsung demi keamanan data transaksi Anda.
- **Tidak Bisa Mengakses Data Rahasia**: Virtual CS tidak memiliki akses ke kata sandi pengguna atau data milik perusahaan/tenant lain.

---

## Tips Bertanya Kepada Virtual CS

- Sebutkan nama produk atau nomor dokumen secara spesifik (contoh: *"Status pengiriman untuk SO-2026-0012"*).
- Gunakan tombol rekomendasi pertanyaan di bawah kolom chat untuk topik-topik populer.
`,
    modules: ['global'],
    tags: ['virtual-cs', 'bantuan', 'chat', 'panduan'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
  {
    slug: 'cara-beri-feedback-dan-eskalasi',
    title: 'Cara Beri Feedback & Eskalasi Kendala Support',
    summary: 'Panduan memberikan penilaian terhadap jawaban Virtual CS serta tata cara melakukan eskalasi kendala teknis kepada tim Admin atau Support.',
    bodyMd: `## Berkontribusi Lewat Ulasan Feedback

Setiap kali Anda berinteraksi dengan Virtual CS di menu **Bantuan → Tanya Virtual CS**, Anda dapat memberikan umpan balik (feedback) pada setiap jawaban yang diberikan:

- Klik ikon **👍 (Suka)** jika jawaban akurat dan membantu menyelesaikan pertanyaan Anda.
- Klik ikon **👎 (Tidak Suka)** jika jawaban kurang tepat atau membingungkan.
- Masukan Anda akan digunakan oleh tim pengembangan untuk terus menyempurnakan artikel panduan pengetahuan (*Knowledge Base*).

---

## Tata Cara Melakukan Eskalasi Kendala

Jika Anda mengalami kendala transaksi atau error sistem yang memerlukan penanganan lanjut:

### 1. Pencarian Mandiri di Artikel Bantuan
Buka menu **Bantuan → Cara Pakai** atau **Troubleshooting** untuk membaca solusi atas kode error seperti \`CREDIT_LIMIT_EXCEEDED\`, \`MATERIAL_INSUFFICIENT\`, atau \`PERIOD_LOCKED\`.

### 2. Meminta Bantuan Admin Perusahaan
Hubungi Admin internal perusahaan Anda untuk:
- Mengubah alokasi persediaan barang atau batas kredit customer.
- Membuka kembali periode akuntansi yang terkunci.
- Mengatur hak akses role pengguna.

### 3. Menyusun Laporan Kendala (Template Eskalasi)
Saat melaporkan masalah kepada Admin atau Tim Support, sertakan informasi rinci dengan format berikut agar dapat ditangani dengan cepat:

\`\`\`text
[Laporan Kendala System]
- Halaman/Menu: Penjualan → Sales Order
- Langkah yang dilakukan: Menekan tombol Konfirmasi Order pada SO-2026-0005
- Pesan Error/Peringatan: FG_DEMAND_QUEUED (Stok tidak mencukupi)
- Detail Produk/Gudang: Produk MP 15, Gudang Utama
- Versi Aplikasi: Lihat di menu Pengaturan → Sistem
\`\`\`
`,
    modules: ['global'],
    tags: ['feedback', 'eskalasi', 'bantuan', 'template'],
    errorCodes: [],
    source: 'SEED' as HelpArticleSource,
  },
];

async function seedHelpArticles() {
  console.log('Seeding help articles (v3 cleaned & user-friendly)...');
  for (const article of seedArticles) {
    const existing = await mainDb.helpArticle.findUnique({ where: { slug: article.slug } });
    if (existing) {
      await mainDb.helpArticle.update({
        where: { slug: article.slug },
        data: {
          title: article.title,
          summary: article.summary,
          bodyMd: article.bodyMd,
          modules: article.modules,
          tags: article.tags,
          errorCodes: article.errorCodes,
          source: article.source,
        },
      });
      console.log(`  [UPD] ${article.slug}`);
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
  console.log(`\nDone total ${total}`);
}

seedHelpArticles()
  .catch((e) => {
    console.error('Seed failed', e);
    process.exit(1);
  })
  .finally(() => mainDb.$disconnect());
