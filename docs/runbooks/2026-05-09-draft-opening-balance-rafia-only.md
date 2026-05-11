# Draft Struktur Opening Balance Mei — Rafia Only

Updated: 2026-05-09
Source files:
- `/Users/nugroho/Downloads/Neraca Apr 26.pdf`
- `/Users/nugroho/Downloads/Laba Rugi Apr 26.pdf`
Context:
- Tenant Melindo (`melindo_rafia`) sudah di-reset transaksional.
- Tujuan dokumen ini adalah menyusun draft baseline opening balance Mei berbasis komponen Rafia saja, bukan angka gabungan GJ/SKW.

## 1. Posisi umum
Dokumen PDF sumber tercampur antara beberapa entitas/line usaha. Karena itu, angka total pada Neraca dan Laba Rugi **tidak boleh langsung** dipakai sebagai opening balance tenant Melindo.

Pendekatan yang dipakai di dokumen ini:
- ambil akun yang jelas bertanda `Rafia` atau suffix `b`
- pisahkan mana yang layak jadi baseline Rafia-only
- tandai mana yang masih missing / belum lengkap / belum cocok untuk inject langsung ke PolyFlow

## 2. Akun Neraca Rafia-only yang berhasil diidentifikasi

### Aset lancar / current assets
| Kode lama | Nama | Saldo |
|---|---|---:|
| 1-115b | Piutang Dagang Rafia | 131,547,500.00 |
| 1-116b | Pajak Dibayar Dimuka Rafia | 647,584,521.00 |
| 1-124b | Asuransi Dibayar Dimuka Rafia | 3,044,187.00 |
| 1-128 | Persediaan Barang Jadi Rafia | 238,786,082.43 |
| 1-130 | Persediaan Bahan Baku Rafia | 448,695,074.98 |
| 1-131 | Persediaan Bahan Kemasan Rafia | 125,751,912.43 |

### Aset tetap / fixed assets
| Kode lama | Nama | Saldo |
|---|---|---:|
| 1-212b | Bangunan Rafia | 386,478,000.00 |
| 1-213b | Mesin Rafia | 2,201,648,880.00 |
| 1-215b | Peralatan Kantor Rafia | 98,993,008.99 |

### Kontra-aset
| Kode lama | Nama | Saldo |
|---|---|---:|
| 1-216b | Akum. Penyusutan Bangunan Rafia | -93,469,324.50 |
| 1-217b | Akum. Penyusutan Mesin Rafia | -903,580,494.67 |
| 1-219b | Akum. Penyusutan Peralatan Kantor Rafia | MISSING dari extraction |

### Kewajiban / liabilities
| Kode lama | Nama | Saldo |
|---|---|---:|
| 2-110b | Hutang Dagang Rafia | 1,679,877,984.42 |
| 2-120b | PPN Keluaran Rafia | 660,348,424.88 |
| 2-130b | PPN Masukan Rafia | -135,375,089.23 |
| 2-140b | Hutang Lancar Lainnya Rafia | 24,331,870.00 |

### Ekuitas
| Kode lama | Nama | Saldo |
|---|---|---:|
| 3-100b | Modal Saham Rafia | 0.00 |
| 3-200b | Laba Ditahan Rafia | 355,640,088.24 |
| 3-201b | Laba Tahun Berjalan Rafia | 129,645,046.18 |

## 3. Subtotal Rafia-only yang bisa dihitung sekarang
- Gross assets teridentifikasi: `4,282,529,166.83`
- Contra assets teridentifikasi: `-997,049,819.17`
- Net assets partial: `3,285,479,347.66`
- Total liabilities teridentifikasi: `2,229,183,190.07`
- Total equity teridentifikasi: `485,285,134.42`
- Residual gap / missing bucket: `571,011,023.17`

Interpretasi:
- data Rafia-only yang berhasil diekstrak **belum lengkap**
- masih ada akun Rafia yang belum tertangkap atau tidak eksplisit bertanda Rafia
- setidaknya ada satu baris yang missing (`1-219b` akumulasi penyusutan peralatan kantor)
- kemungkinan ada akun liabilitas jangka panjang Rafia atau aset lain yang belum dimasukkan dalam subtotal ini

## 4. Laba Rugi April — apa yang bisa dipercaya dan apa yang tidak
PDF Laba Rugi bertuliskan:
- `Periode:`
- `RAFIA GJ & SKW`

Jadi laporan ini **bukan murni Rafia-only**. Namun akun yang eksplisit bertanda Rafia tetap bisa dipakai sebagai petunjuk.

### Revenue lines yang eksplisit “Rafia”
| Kode | Nama | Nilai |
|---|---|---:|
| 4-101 | Penjualan Rafia Bal | 344,976,321.08 |
| 4-102 | Penjualan Rafia Super | 34,310,211.71 |
| 4-104 | Penjualan Rafia Kw | 235,739,360.36 |
| 4-107 | Penjualan Rafia Tampar | 48,094,000.00 |

Total revenue eksplisit Rafia yang tertangkap: `663,119,893.15`

### Expense lines yang eksplisit “Rafia”
| Kode | Nama | Nilai |
|---|---|---:|
| 5-012b | Tenaga Kerja Langsung Rafia | 90,402,500.00 |
| 5-013b | Biaya Penyusutan Mesin Rafia | 35,633,185.00 |
| 6-001b | Biaya Kunjungan Pelanggan Rafia | 2,889,000.00 |
| 6-004b | Biaya Operasional Truck Box Rafia | 1,282,285.00 |
| 6-026b | Biaya Kirim Paket / Dokumen Rafia | 8,000.00 |
| 6-011b | Gaji Rafia | 25,850,000.00 |
| 6-012b | Alat Tulis Kantor Rafia | 1,266,718.04 |
| 6-014b | PDAM & Telkom Rafia | 678,900.00 |
| 6-020b | Biaya Perlengkapan & Kebutuhan Kantor Rafia | 2,954,885.59 |
| 6-015b | Biaya Penyusutan Kantor Rafia | 4,337,208.71 |
| 6-025b | Biaya Pajak Air Tanah Rafia | 231,354.00 |
| 6-041 | Biaya Penyusutan Bangunan Rafia | 4,064,512.50 |

Total expense eksplisit Rafia yang tertangkap: `169,598,548.84`

Partial profit eksplisit Rafia hasil ekstraksi: `493,521,344.31`

Tapi neraca menyatakan:
- `3-201b Laba Tahun Berjalan Rafia = 129,645,046.18`

Selisih: `363,876,298.13`

Interpretasi:
- laporan laba rugi tidak bisa dipakai mentah sebagai laba Rafia-only
- karena header sendiri sudah menyatakan gabungan `RAFIA GJ & SKW`
- jadi angka laba berjalan yang paling aman sementara justru adalah yang muncul di Neraca: `129,645,046.18`

## 5. Mapping praktis ke fase opening balance PolyFlow

### Bucket A — Bisa masuk journal opening langsung
Karena bukan subledger operasional khusus:
- Pajak Dibayar Dimuka Rafia (`1-116b`)
- Asuransi Dibayar Dimuka Rafia (`1-124b`)
- Hutang Lancar Lainnya Rafia (`2-140b`) — subject to review
- Modal Saham / Laba Ditahan / Laba Tahun Berjalan
- akun koreksi atau placeholder bila diperlukan

### Bucket B — Jangan cuma dijournal, sebaiknya via module / subledger
- Piutang Dagang Rafia (`1-115b`) → AR flow
- Hutang Dagang Rafia (`2-110b`) → AP flow
- Inventory:
  - `1-128` Persediaan Barang Jadi Rafia
  - `1-130` Persediaan Bahan Baku Rafia
  - `1-131` Persediaan Bahan Kemasan Rafia

### Bucket C — Idealnya via fixed asset setup
- `1-212b` Bangunan Rafia
- `1-213b` Mesin Rafia
- `1-215b` Peralatan Kantor Rafia
- `1-216b` / `1-217b` / `1-219b` accumulated depreciation

### Bucket D — Perlu keputusan khusus
- `2-120b` PPN Keluaran Rafia
- `2-130b` PPN Masukan Rafia

Menurut gue dua akun PPN ini jangan langsung dimasukkan membabi buta sebagai opening balance sebelum diputuskan apakah:
- memang mau dibawa ke sistem baru,
- atau mau dibersihkan / direklas,
- atau sedang bagian dari saldo historis lintas entitas.

## 6. Draft struktur opening balance Mei (versi kerja)

### Paling konservatif / aman
Buat baseline opening Mei memakai:
1. Equity dari neraca Rafia-only
2. AR/AP/inventory/fixed asset secara bertahap lewat modul masing-masing
3. OBE / placeholder hanya untuk gap yang memang dipakai sebagai jembatan implementasi, bukan tempat semua akun ditumpuk

### Draft bucket angka yang bisa dipakai lebih dulu
1. AR candidate:
- `1-115b` = `131,547,500.00`

2. Inventory candidate total:
- FG `238,786,082.43`
- RM `448,695,074.98`
- Packaging `125,751,912.43`
- subtotal inventory = `813,233,069.84`

3. Fixed asset candidate gross:
- Bangunan `386,478,000.00`
- Mesin `2,201,648,880.00`
- Peralatan Kantor `98,993,008.99`
- subtotal gross FA = `2,687,119,888.99`

4. Accumulated depreciation candidate known:
- Bangunan `93,469,324.50`
- Mesin `903,580,494.67`
- subtotal known acc. depr. = `997,049,819.17`
- plus `1-219b` masih missing

5. AP candidate:
- Trade payables `1,679,877,984.42`

6. Equity candidates:
- Laba Ditahan `355,640,088.24`
- Laba Tahun Berjalan `129,645,046.18`
- Modal Saham `0.00`

## 7. What is NOT ready yet
Belum siap eksekusi opening balance final karena:
1. `1-219b` belum dapat angkanya
2. kemungkinan ada akun Rafia lain yang belum ketarik
3. PPN accounts perlu keputusan kebijakan
4. laporan laba rugi gabungan tidak bisa dipakai mentah sebagai dasar Rafia-only
5. belum ada daftar rincian AR customer-by-customer / AP supplier-by-supplier / FA asset-by-asset / inventory item-by-item

## 8. Recommended next step
Urutan paling masuk akal sekarang:
1. finalisasi neraca Rafia-only (lengkapi akun missing, terutama `1-219b` dan akun long-term liability bila ada)
2. putuskan treatment akun PPN
3. siapkan empat working papers:
   - AR detail per customer
   - AP detail per supplier
   - Fixed asset register per asset
   - Inventory opening per item/location
4. baru susun SQL / import plan opening balance Mei

## 9. Conclusion
Data PDF yang ada **sudah cukup bagus sebagai petunjuk awal**, tapi **belum cukup bersih untuk langsung dieksekusi** menjadi opening balance final.

Kalau dipaksa eksekusi sekarang, risiko terbesarnya:
- opening balance tidak balance,
- saldo Rafia masih tercampur elemen non-Rafia,
- AR/AP/inventory/fixed asset tidak sinkron dengan modul PolyFlow.

Jadi pendekatan terbaik tetap:
- pakai neraca ini sebagai baseline,
- tetapi lakukan satu putaran pembersihan / pemetaan detail dulu sebelum posting opening balance.
