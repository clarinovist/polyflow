# SOP Maklon Sales Operasional

## Tujuan

Menetapkan langkah operasional yang konsisten untuk order `Maklon Jasa` di PolyFlow agar tim sales, warehouse, planning, dan finance memahami bahwa bahan titipan customer tidak dikeluarkan melalui shipment Sales Order biasa.

## Ruang Lingkup

SOP ini berlaku untuk:

- penerimaan bahan titipan customer;
- pembuatan Sales Order `Maklon Jasa`;
- pembuatan dan pelaksanaan Work Order maklon;
- penagihan jasa maklon;
- penanganan sisa bahan titipan.

## Definisi Singkat

- `Maklon Jasa`: order jasa produksi dengan bahan baku milik customer.
- `CUSTOMER_OWNED`: tipe lokasi untuk menyimpan bahan titipan customer agar terpisah dari stok milik perusahaan.
- `Production Execution / backflush`: proses sistem mengurangi bahan baku yang dipakai selama produksi.

## Tanggung Jawab

- Sales: membuat Sales Order maklon dan memastikan transaksi customer tercatat benar.
- Warehouse: menerima bahan titipan ke lokasi `CUSTOMER_OWNED` dan mengelola perpindahan fisik bahan.
- Planning / Production: membuat Work Order maklon dan menjalankan produksi.
- Finance: membuat invoice jasa berdasarkan Sales Order maklon.

## Prosedur

### 1. Setup lokasi bahan titipan

1. Pastikan tersedia location dengan tipe `CUSTOMER_OWNED` untuk customer terkait.
2. Gunakan lokasi ini untuk menyimpan semua bahan titipan yang masih menjadi milik customer.

### 2. Penerimaan bahan titipan

1. Warehouse menerima bahan titipan melalui flow receive maklon.
2. Arahkan penerimaan ke lokasi `CUSTOMER_OWNED` yang sesuai.
3. Pastikan bahan tercatat sebagai stok titipan customer, bukan inventory perusahaan.

### 3. Pembuatan Sales Order maklon

1. Sales membuat Sales Order dengan tipe `MAKLON_JASA`.
2. Customer wajib diisi.
3. Line item yang dipakai harus berupa item service atau jasa, bukan barang fisik.
4. Sales Order dipakai sebagai dasar demand customer dan invoicing jasa.

### 4. Konfirmasi Sales Order

1. Setelah Sales Order dikonfirmasi, status order berpindah ke `IN_PRODUCTION`.
2. Pada tahap ini tidak ada shipment barang dari Sales Order.
3. Order dilanjutkan ke proses produksi sebagai demand customer.

### 5. Pembuatan Work Order maklon

1. Planning atau Production membuat Work Order yang terhubung ke demand maklon.
2. Tandai work order sebagai `isMaklon`.
3. Isi customer maklon dan estimasi biaya konversi bila diperlukan.

### 6. Mekanisme pengeluaran bahan maklon

1. Pengeluaran bahan maklon tidak dilakukan dari Sales Order.
2. Konsumsi bahan terjadi saat `Production Execution / backflush`.
3. Sistem akan mencoba mengambil bahan dari lokasi produksi terlebih dahulu jika stok sudah ada di sana.
4. Jika stok tidak tersedia di lokasi produksi, sistem akan fallback ke lokasi `CUSTOMER_OWNED`.

## Aturan Kontrol

- Jangan lakukan shipment Sales Order untuk mengeluarkan bahan titipan customer.
- Jangan campurkan bahan maklon ke gudang internal biasa bila bahan masih milik customer.
- Gunakan flow return maklon jika ada sisa bahan yang dikembalikan.
- Invoice dibuat dari Sales Order maklon karena objek penjualannya adalah jasa produksi.

## Output yang Diharapkan

- bahan titipan tercatat terpisah dari stok perusahaan;
- Sales Order mewakili transaksi jasa ke customer;
- Work Order maklon memiliki jejak demand yang jelas;
- konsumsi bahan tercatat di execution produksi;
- invoice jasa dapat diterbitkan dengan referensi Sales Order yang benar.

## Ringkasan Praktis

Jika user bertanya apakah barang maklon harus dikeluarkan dari sales, jawabannya adalah:

- tidak, bahan titipan tidak keluar dari Sales Order;
- Sales Order dipakai untuk order jasa dan invoice;
- pengeluaran bahan terjadi saat produksi berjalan.