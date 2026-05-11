# Melindo Opening Balance — Checklist Kebutuhan Data

Updated: 2026-05-09
Target tenant: `melindo` / DB `melindo_rafia`
Status: tenant sudah di-reset transaksional, siap untuk fase setup opening balance baru.

## Tujuan checklist ini
Dokumen ini menjawab pertanyaan: "data apa saja yang perlu diisi / disiapkan supaya opening balance Mei bisa dibangun dengan rapi di PolyFlow?"

Prinsip:
- jangan mulai dari journal total besar tanpa rincian modul
- AR/AP/Inventory/Fixed Asset idealnya masuk lewat struktur detail, bukan angka lump-sum saja
- neraca April dipakai sebagai baseline kontrol, bukan satu-satunya sumber input

## 1. Keputusan dasar yang perlu dikunci dulu
Ini bukan angka, tapi keputusan policy. Tanpa ini implementasi bisa salah arah.

1. Tanggal cut-off opening balance
   - contoh: `1 Mei 2026`
   - pertanyaan: apakah semua saldo per `30 Apr 2026` akan dibawa sebagai opening per `1 Mei 2026`?

2. Scope opening balance
   Pilih mana yang benar-benar mau dibawa:
   - cash/bank
   - AR
   - AP
   - inventory
   - fixed assets
   - prepaid expenses
   - hutang lain-lain
   - PPN masukan / keluaran

3. Kebijakan akun pajak
   - apakah `PPN Keluaran` dan `PPN Masukan` mau dibawa ke sistem baru?
   - atau direklas / dibersihkan dulu?

4. Kebijakan COA
   - pakai struktur akun legacy Rafia yang sekarang masih ada di DB?
   - atau sekalian normalisasi ke COA PolyFlow yang lebih standar?

## 2. Minimum data yang perlu diisi
Kalau mau opening balance benar-benar usable, ini kebutuhan minimum per bucket.

### A. Cash & Bank
Per rekening / kas:
- nama akun
- kode akun target di PolyFlow
- saldo opening
- sumber angka (bank statement / kas opname / neraca)
- catatan apakah akun aktif dipakai atau hanya historis

Contoh format:
- `11120 | Bank BCA - IDR | 1,145,995.70`
- `11121 | Kas Kecil | 41,866,606.60`

### B. Accounts Receivable (AR)
Per customer, bukan hanya total.

Yang perlu diisi:
- nama customer
- apakah customer sudah ada di master PolyFlow
- nomor invoice / referensi dokumen
- tanggal invoice
- tanggal jatuh tempo
- saldo outstanding
- catatan khusus (dispute, bad debt, sudah dibayar sebagian, dll)

Kalau belum ada rincian invoice, minimal perlu:
- nama customer
- total outstanding per customer
- catatan bahwa ini opening receivable summary

Catatan:
- total kontrol dari neraca saat ini: `Piutang Dagang Rafia = 131,547,500.00`

### C. Accounts Payable (AP)
Per supplier, bukan hanya total.

Yang perlu diisi:
- nama supplier
- apakah supplier sudah ada di master PolyFlow
- nomor tagihan / referensi
- tanggal tagihan
- tanggal jatuh tempo
- saldo outstanding
- catatan khusus

Kalau belum ada rincian invoice, minimal perlu:
- nama supplier
- total outstanding per supplier

Catatan:
- total kontrol dari neraca saat ini: `Hutang Dagang Rafia = 1,679,877,984.42`

### D. Inventory Opening
Ini bucket paling sensitif. Harus per item / variant, bukan total GL saja.

Yang perlu diisi per item:
- SKU / kode barang
- nama product / variant
- kategori inventory:
  - bahan baku
  - barang jadi
  - bahan kemasan
  - WIP (kalau memang mau dibawa)
  - scrap (kalau ada)
- lokasi / gudang
- qty opening
- unit of measure
- unit cost
- total value
- catatan (slow moving / obsolete / konsinyasi / dll)

Catatan kontrol dari neraca:
- FG `238,786,082.43`
- RM `448,695,074.98`
- Packaging `125,751,912.43`
- subtotal inventory teridentifikasi `813,233,069.84`

### E. Fixed Assets
Harus per aset, bukan 1 angka total.

Yang perlu diisi per aset:
- nama aset
- kategori aset (bangunan / mesin / kendaraan / peralatan kantor)
- tanggal perolehan
- harga perolehan / gross cost
- akumulasi penyusutan per cut-off
- nilai buku
- umur manfaat
- metode penyusutan
- apakah aset masih aktif dipakai
- nomor referensi / label aset (kalau ada)

Catatan kontrol dari neraca:
- Bangunan Rafia `386,478,000.00`
- Mesin Rafia `2,201,648,880.00`
- Peralatan Kantor Rafia `98,993,008.99`
- Akum. Penyusutan Bangunan `93,469,324.50`
- Akum. Penyusutan Mesin `903,580,494.67`
- Akum. Penyusutan Peralatan Kantor `MISSING dari PDF extraction` → perlu dilengkapi

### F. Prepaid / Aset Lancar Lainnya
Per akun:
- nama akun
- saldo opening
- dasar perhitungan
- masa manfaat / periode amortisasi kalau relevan
- catatan apakah nanti diamortisasi di PolyFlow atau cukup dibawa sebagai saldo awal

Yang sudah terdeteksi:
- Pajak Dibayar Dimuka Rafia `647,584,521.00`
- Asuransi Dibayar Dimuka Rafia `3,044,187.00`
- Uang Muka ke Supplier → perlu diputuskan apakah ini milik Rafia murni dan mau dibawa atau tidak

### G. Hutang Lain-lain / Pinjaman / Long-term Liabilities
Per kreditur:
- nama pihak
- saldo outstanding
- jatuh tempo / tenor
- bunga (kalau ada)
- apakah current / non-current
- catatan legal / owner loan / related party

Catatan:
- dari PDF yang sudah kebaca, masih sangat mungkin ada hutang jangka panjang terkait Rafia yang perlu diputuskan apakah ikut dibawa.
- jangan hanya mengandalkan total neraca campuran.

### H. Equity / Saldo Ekuitas Awal
Yang perlu dikunci:
- modal disetor yang mau diakui
- laba ditahan opening
- laba tahun berjalan yang dibawa atau ditutup ke retained earnings
- apakah ada koreksi manajemen / owner adjustment

Catatan kontrol dari neraca:
- Modal Saham Rafia `0.00`
- Laba Ditahan Rafia `355,640,088.24`
- Laba Tahun Berjalan Rafia `129,645,046.18`

## 3. Data referensi yang sangat membantu
Kalau ada, ini akan mempercepat kerja dan mengurangi asumsi.

1. Neraca detail Rafia-only yang bersih
2. Laba rugi Rafia-only yang tidak tercampur GJ/SKW
3. Aging AR per customer
4. Aging AP per supplier
5. Stock list per item + qty + nilai
6. Fixed asset register
7. Rekap bank statement / kas posisi akhir April
8. Rekap pajak yang memang mau dibawa

## 4. Format paling praktis untuk diisi
Kalau mau cepat, paling enak isi dalam 4 sheet / 4 tabel:

1. `AR_opening`
Kolom minimal:
- customer_name
- invoice_ref
- invoice_date
- due_date
- amount
- note

2. `AP_opening`
Kolom minimal:
- supplier_name
- bill_ref
- bill_date
- due_date
- amount
- note

3. `Inventory_opening`
Kolom minimal:
- sku
- product_name
- variant_name
- category
- location
- qty
- unit
- unit_cost
- total_value
- note

4. `FixedAsset_opening`
Kolom minimal:
- asset_name
- asset_category
- acquisition_date
- gross_cost
- accumulated_depreciation
- book_value
- useful_life_months
- depreciation_method
- note

Tambahan optional sheet:
5. `GL_opening_manual`
Untuk akun non-subledger, misalnya:
- prepaid
- hutang lain-lain
- equity
- akun koreksi

Kolom minimal:
- account_code
- account_name
- debit
- credit
- note

## 5. Urutan pengisian yang gue sarankan
Supaya paling aman dan minim rework:

1. Finalisasi policy
   - cut-off
   - bawa PPN atau tidak
   - pakai COA lama atau normalisasi

2. Isi master-detail yang paling berat:
   - inventory
   - fixed assets

3. Isi subledger:
   - AR
   - AP

4. Baru isi akun manual / journal opening:
   - prepaid
   - hutang lain-lain
   - equity
   - balancing / placeholder yang memang perlu

## 6. Checklist singkat yang bisa langsung dikerjakan user
Kalau mau versi paling praktis, tolong siapkan ini:

Mandatory:
- [ ] tanggal cut-off opening balance
- [ ] keputusan treatment PPN
- [ ] daftar AR per customer
- [ ] daftar AP per supplier
- [ ] daftar inventory per item + qty + nilai
- [ ] daftar fixed asset per aset + gross + akumulasi penyusutan
- [ ] daftar akun prepaid / hutang lain-lain yang mau dibawa
- [ ] keputusan laba berjalan tetap dipisah atau ditutup ke laba ditahan

Nice to have:
- [ ] neraca Rafia-only yang sudah dibersihkan
- [ ] laba rugi Rafia-only yang tidak campur entitas lain
- [ ] bukti pendukung / sheet sumber untuk audit trail

## 7. Next recommended action
Setelah checklist ini, langkah terbaik adalah memilih satu format kerja:
- Google Sheet
- Excel
- atau markdown table sederhana

Lalu isi minimal 4 working paper:
- AR
- AP
- Inventory
- Fixed Assets

Baru setelah itu kita bisa susun opening balance yang benar-benar siap dieksekusi ke PolyFlow.
