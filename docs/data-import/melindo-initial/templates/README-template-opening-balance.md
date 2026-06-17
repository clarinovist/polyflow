# Template Pengisian Opening Balance Melindo

Tanggal: 2026-06-10
Target: Admin Melindo
Tujuan: Membantu admin menyiapkan data opening balance lanjutan dalam format yang mudah diisi dan mudah diimport ke PolyFlow.

## File template yang disiapkan

1. AR / Piutang Usaha
- `docs/data-import/melindo-initial/templates/ar_opening_template.csv`

2. AP / Hutang Usaha
- `docs/data-import/melindo-initial/templates/ap_opening_template.csv`

3. Inventory / Persediaan
- `docs/data-import/melindo-initial/templates/inventory_opening_template.csv`

4. Fixed Asset / Aset Tetap
- `docs/data-import/melindo-initial/templates/fixed_asset_opening_template.csv`

## Aturan umum pengisian

- Satu baris = satu data transaksi / item / aset
- Jangan menghapus header kolom di baris pertama
- Angka diisi tanpa titik pemisah ribuan
  - benar: `15000000`
  - jangan: `15.000.000`
- Tanggal gunakan format `YYYY-MM-DD`
  - contoh: `2026-05-31`
- Jika belum ada data pada kolom tertentu, boleh dikosongkan, kecuali kolom utama yang wajib
- Jika satu pihak punya banyak invoice / tagihan, lebih baik dipisah per baris

## 1. Template AR / Piutang Usaha

Kolom:
- `nama_customer` = nama customer sesuai master customer
- `nomor_invoice` = nomor invoice / referensi dokumen, kalau ada
- `tanggal_invoice` = tanggal invoice
- `tanggal_jatuh_tempo` = tanggal jatuh tempo pembayaran
- `nilai_piutang` = nilai outstanding piutang
- `keterangan` = catatan tambahan

Minimal wajib diisi:
- `nama_customer`
- `nilai_piutang`

Kalau belum ada rincian invoice:
- boleh satu customer satu baris dulu
- isi `nomor_invoice` dengan misalnya `OPENING-AR`
- isi `keterangan` bahwa ini summary opening per customer

## 2. Template AP / Hutang Usaha

Kolom:
- `nama_supplier` = nama supplier sesuai master supplier
- `nomor_tagihan` = nomor bill / invoice supplier
- `tanggal_tagihan` = tanggal tagihan
- `tanggal_jatuh_tempo` = tanggal jatuh tempo
- `nilai_hutang` = nilai outstanding hutang
- `keterangan` = catatan tambahan

Minimal wajib diisi:
- `nama_supplier`
- `nilai_hutang`

Kalau belum ada rincian tagihan:
- boleh satu supplier satu baris dulu
- isi `nomor_tagihan` dengan misalnya `OPENING-AP`
- isi `keterangan` bahwa ini summary opening per supplier

## 3. Template Inventory / Persediaan

Kolom:
- `kode_barang` = kode SKU kalau ada
- `nama_barang` = nama barang / varian
- `lokasi_gudang` = default boleh `Gudang Utama`
- `kuantitas` = qty stok opening
- `satuan` = contoh `KG`, `BAL`, `PCS`, `ZAK`
- `harga_satuan` = nilai per unit
- `total_nilai` = total nilai persediaan
- `kategori` = contoh `Bahan Baku`, `Barang Jadi`, `Bahan Kemasan`, `WIP`, `Bahan Penolong`
- `keterangan` = catatan tambahan

Minimal wajib diisi:
- `nama_barang`
- `kuantitas`
- `satuan`
- `total_nilai`

Catatan:
- Kalau `harga_satuan` belum ada, paling tidak isi `total_nilai`
- Kalau ada `harga_satuan`, usahakan `kuantitas x harga_satuan = total_nilai`
- Inventory harus detail per item, jangan hanya total per kategori

## 4. Template Fixed Asset / Aset Tetap

Kolom:
- `nama_aset` = nama aset
- `kategori_aset` = contoh `Mesin`, `Bangunan`, `Kendaraan`, `Peralatan Kantor`
- `tanggal_perolehan` = tanggal beli / perolehan
- `harga_perolehan` = nilai perolehan bruto
- `akumulasi_penyusutan` = total akumulasi penyusutan per cut-off
- `umur_manfaat_bulan` = masa manfaat dalam bulan
- `metode_penyusutan` = contoh `Garis Lurus`
- `keterangan` = catatan tambahan

Minimal wajib diisi:
- `nama_aset`
- `kategori_aset`
- `harga_perolehan`
- `akumulasi_penyusutan`

Catatan:
- Aset tetap harus detail per aset, jangan satu angka total per kategori saja
- Kalau tanggal perolehan belum ada persis, boleh isi perkiraan dulu lalu beri catatan di `keterangan`

## Rekomendasi pengisian untuk admin

Urutan paling mudah:
1. Isi AR dulu
2. Isi AP
3. Isi Inventory
4. Isi Aset Tetap

Kalau ingin paling cepat:
- AR/AP boleh per customer / per supplier dulu
- Inventory dan aset tetap tetap harus detail

## Setelah file terisi

Nanti file yang sudah diisi bisa dikirim balik untuk:
1. dicek konsistensinya
2. dibersihkan formatnya
3. dibuatkan package import ke `melindo_rafia`
