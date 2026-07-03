# Melindo BARANG JADI — 35 Manual Product Decisions

Status: customer dan supplier sudah berhasil diimport. Fokus berikutnya adalah 35 row produk yang masih butuh keputusan manual sebelum import/update product dijalankan.

Aturan yang sudah disepakati:
- format desimal yang benar di nama produk adalah koma, mis. `0,75`
- format titik, mis. `0.75`, adalah typo admin
- `Pack` dan `Karton` dinormalisasi ke unit `PCS`

Ringkasan issue:
- Total manual-review rows: 35
- Missing SKU: 20
- Duplicate SKU in sheet: 15
- SKU bentrok dengan existing variant lain: 10
- Unit normalization needed: 15
- Name typo / formatting issue: 5

## 1) Missing SKU (20 rows)
Semua row di bawah ini belum bisa diimport sebelum diberi SKU unik.

| sourceRow | name | sheetUnit | suggestedPrimaryUnit | suggestedHandling |
| --- | --- | --- | --- | --- |
| 80 | Rafia Merah Super 1 (6) | Bal | BAL | Isi SKU baru unik |
| 82 | Rafia Netral | Kg | KG | Isi SKU baru unik |
| 89 | Rafia Warna KW 0,2 (10) | Bal | BAL | Isi SKU baru unik |
| 177 | Sedotan Biru Lurik Dop Lubang 6,5 | Kg | KG | Isi SKU baru unik |
| 194 | Sedotan Hijau Lurik Dop Lubang 6,5 | Kg | KG | Isi SKU baru unik |
| 202 | Sedotan Hitam Lancip | Kg | KG | Isi SKU baru unik |
| 206 | Sedotan Hitam Lurik Dop Luban 6 Jasa | Kg | KG | Isi SKU baru unik |
| 208 | Sedotan Hitam Steril Bal Dalam Printing Luar Polos | Bal | BAL | Isi SKU baru unik |
| 210 | Sedotan Hitam Steril Bal Full Polos Isi 500 | Bal | BAL | Isi SKU baru unik |
| 227 | Sedotan Hitam Steril Zak Full Polos | Zak | ZAK | Isi SKU baru unik |
| 245 | Sedotan Kuning Lurik Dop Lubang 6,5 | Kg | KG | Isi SKU baru unik |
| 274 | Sedotan Merah Lurik Dop Lubang 6,5 | Kg | KG | Isi SKU baru unik |
| 277 | Sedotan Merah Super 0,95 (10) | Bal | BAL | Isi SKU baru unik |
| 294 | Sedotan Pink Lurik Dop Lubang 6,5 | Kg | KG | Isi SKU baru unik |
| 302 | Sedotan Putih Dop Super 90gr | Pack | PCS | Isi SKU baru unik; Map unit Pack -> PCS |
| 311 | Sedotan Ungu Lurik Dop Lubang 6,5 | Kg | KG | Isi SKU baru unik |
| 314 | Sedotan Ungu Super Jasa | Kg | KG | Isi SKU baru unik |
| 323 | Sedotan Warna Lurik Dop 170gr | Pack | PCS | Isi SKU baru unik; Map unit Pack -> PCS |
| 325 | Sedotan Warna Lurik Dop 200gr | Pack | PCS | Isi SKU baru unik; Map unit Pack -> PCS |
| 334 | Sedotan Warna Pop Ice Tumpul 130gr | Pack | PCS | Isi SKU baru unik; Map unit Pack -> PCS |

## 2) Duplicate SKU di sheet (15 rows)
Di grup ini ada beberapa SKU yang dipakai lebih dari satu row. Harus dipastikan SKU mana yang tetap, dan row mana yang perlu SKU baru.

| sourceRow | name | productCode | sheetUnit | existingNamesUsingSameSku | suggestedHandling |
| --- | --- | --- | --- | --- | --- |
| 138 | Sedotan Bening Lurik Merah Dop Lancip Lubang 6 | SBLMDSL6 | Kg | Sedotan Bening Lurik Merah Dop Lancip Lubang 6 | Pastikan hanya 1 produk memakai SKU ini; Samakan nama ke format koma |
| 144 | Sedotan Bening Lurik Merah Putih Lancip Lubang 6 | SBLMDSL6 | Kg | Sedotan Bening Lurik Merah Dop Lancip Lubang 6 | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama |
| 203 | Sedotan Hitam Lancip Lubang 12 | BJ000015 | Kg | Sedotan Warna Lurik Double 70gr | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama |
| 207 | Sedotan Hitam Steril | SHS00WL-20 | Pack | Sedotan Hitam Steril | Pastikan hanya 1 produk memakai SKU ini; Map unit Pack -> PCS; Samakan nama ke format koma |
| 209 | Sedotan Hitam Steril Bal Full Polos Isi 250 | SHS00WL-00 | Bal | Sedotan Hitam Steril Bal Full Polos Isi 250 | Pastikan hanya 1 produk memakai SKU ini; Samakan nama ke format koma |
| 213 | Sedotan Hitam Steril Full Polos | SHS00WL-00 | Karton | Sedotan Hitam Steril Bal Full Polos Isi 250 | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 214 | Sedotan Hitam Steril Full Polos Isi 250 | SHS00WL-00 | Karton | Sedotan Hitam Steril Bal Full Polos Isi 250 | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 215 | Sedotan Hitam Steril Full Polos Isi 500 | SHS00WL-00 | Karton | Sedotan Hitam Steril Bal Full Polos Isi 250 | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 217 | Sedotan Hitam Steril Full Printing | SHS00WL-11 | Karton | Sedotan Hitam Steril Full Printing | Pastikan hanya 1 produk memakai SKU ini; Map unit Karton -> PCS; Samakan nama ke format koma |
| 218 | Sedotan Hitam Steril Full Printing Isi 250 | SHS00WL-11 | Karton | Sedotan Hitam Steril Full Printing | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 219 | Sedotan Hitam Steril Full Printing Isi 500 | SHS00WL-11 | Karton | Sedotan Hitam Steril Full Printing | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 221 | Sedotan Hitam Steril Kura Isi 250 | SHS00WL-11 | Karton | Sedotan Hitam Steril Full Printing | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 222 | Sedotan Hitam Steril Kura Isi 500 | SHS00WL-11 | Karton | Sedotan Hitam Steril Full Printing | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 223 | Sedotan Hitam Steril Pack Polos Isi 250 | SHS00WL-20 | Pack | Sedotan Hitam Steril | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Pack -> PCS |
| 332 | Sedotan Warna Lurik Double 70gr | BJ000015 | Pack | Sedotan Warna Lurik Double 70gr | Pastikan hanya 1 produk memakai SKU ini; Map unit Pack -> PCS; Samakan nama ke format koma |

## 3) Bentrok SKU dengan existing variant lain (10 rows)
Ini yang paling perlu perhatian. SKU di sheet sekarang sudah dipakai existing variant lain di DB. Kalau memang produk berbeda, SKU harus diganti.

| sourceRow | name | productCode | existingNamesUsingSameSku | sheetUnit | suggestedHandling |
| --- | --- | --- | --- | --- | --- |
| 144 | Sedotan Bening Lurik Merah Putih Lancip Lubang 6 | SBLMDSL6 | Sedotan Bening Lurik Merah Dop Lancip Lubang 6 | Kg | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama |
| 203 | Sedotan Hitam Lancip Lubang 12 | BJ000015 | Sedotan Warna Lurik Double 70gr | Kg | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama |
| 213 | Sedotan Hitam Steril Full Polos | SHS00WL-00 | Sedotan Hitam Steril Bal Full Polos Isi 250 | Karton | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 214 | Sedotan Hitam Steril Full Polos Isi 250 | SHS00WL-00 | Sedotan Hitam Steril Bal Full Polos Isi 250 | Karton | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 215 | Sedotan Hitam Steril Full Polos Isi 500 | SHS00WL-00 | Sedotan Hitam Steril Bal Full Polos Isi 250 | Karton | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 218 | Sedotan Hitam Steril Full Printing Isi 250 | SHS00WL-11 | Sedotan Hitam Steril Full Printing | Karton | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 219 | Sedotan Hitam Steril Full Printing Isi 500 | SHS00WL-11 | Sedotan Hitam Steril Full Printing | Karton | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 221 | Sedotan Hitam Steril Kura Isi 250 | SHS00WL-11 | Sedotan Hitam Steril Full Printing | Karton | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 222 | Sedotan Hitam Steril Kura Isi 500 | SHS00WL-11 | Sedotan Hitam Steril Full Printing | Karton | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 223 | Sedotan Hitam Steril Pack Polos Isi 250 | SHS00WL-20 | Sedotan Hitam Steril | Pack | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Pack -> PCS |

## 4) Unit normalization (15 rows di manual bucket)
Untuk row-row ini, unit sheet tidak akan dipakai mentah. Akan dinormalisasi ke `PCS` saat import nanti.

| sourceRow | name | productCode | sheetUnit | suggestedPrimaryUnit | suggestedHandling |
| --- | --- | --- | --- | --- | --- |
| 207 | Sedotan Hitam Steril | SHS00WL-20 | Pack | PCS | Pastikan hanya 1 produk memakai SKU ini; Map unit Pack -> PCS; Samakan nama ke format koma |
| 213 | Sedotan Hitam Steril Full Polos | SHS00WL-00 | Karton | PCS | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 214 | Sedotan Hitam Steril Full Polos Isi 250 | SHS00WL-00 | Karton | PCS | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 215 | Sedotan Hitam Steril Full Polos Isi 500 | SHS00WL-00 | Karton | PCS | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 217 | Sedotan Hitam Steril Full Printing | SHS00WL-11 | Karton | PCS | Pastikan hanya 1 produk memakai SKU ini; Map unit Karton -> PCS; Samakan nama ke format koma |
| 218 | Sedotan Hitam Steril Full Printing Isi 250 | SHS00WL-11 | Karton | PCS | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 219 | Sedotan Hitam Steril Full Printing Isi 500 | SHS00WL-11 | Karton | PCS | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 221 | Sedotan Hitam Steril Kura Isi 250 | SHS00WL-11 | Karton | PCS | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 222 | Sedotan Hitam Steril Kura Isi 500 | SHS00WL-11 | Karton | PCS | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Karton -> PCS |
| 223 | Sedotan Hitam Steril Pack Polos Isi 250 | SHS00WL-20 | Pack | PCS | Pastikan hanya 1 produk memakai SKU ini; Ganti SKU atau pastikan ini memang produk existing yang sama; Map unit Pack -> PCS |
| 302 | Sedotan Putih Dop Super 90gr |  | Pack | PCS | Isi SKU baru unik; Map unit Pack -> PCS |
| 323 | Sedotan Warna Lurik Dop 170gr |  | Pack | PCS | Isi SKU baru unik; Map unit Pack -> PCS |
| 325 | Sedotan Warna Lurik Dop 200gr |  | Pack | PCS | Isi SKU baru unik; Map unit Pack -> PCS |
| 332 | Sedotan Warna Lurik Double 70gr | BJ000015 | Pack | PCS | Pastikan hanya 1 produk memakai SKU ini; Map unit Pack -> PCS; Samakan nama ke format koma |
| 334 | Sedotan Warna Pop Ice Tumpul 130gr |  | Pack | PCS | Isi SKU baru unik; Map unit Pack -> PCS |

## 5) Name typo / comma-dot formatting (5 rows di manual bucket)
Row di bawah ini mengandung issue nama yang pada dasarnya typo format. Saat import/update nanti nama final sebaiknya diseragamkan ke format koma.

| sourceRow | name | productCode | existingNamesUsingSameSku | suggestedHandling |
| --- | --- | --- | --- | --- |
| 138 | Sedotan Bening Lurik Merah Dop Lancip Lubang 6 | SBLMDSL6 | Sedotan Bening Lurik Merah Dop Lancip Lubang 6 | Pastikan hanya 1 produk memakai SKU ini; Samakan nama ke format koma |
| 207 | Sedotan Hitam Steril | SHS00WL-20 | Sedotan Hitam Steril | Pastikan hanya 1 produk memakai SKU ini; Map unit Pack -> PCS; Samakan nama ke format koma |
| 209 | Sedotan Hitam Steril Bal Full Polos Isi 250 | SHS00WL-00 | Sedotan Hitam Steril Bal Full Polos Isi 250 | Pastikan hanya 1 produk memakai SKU ini; Samakan nama ke format koma |
| 217 | Sedotan Hitam Steril Full Printing | SHS00WL-11 | Sedotan Hitam Steril Full Printing | Pastikan hanya 1 produk memakai SKU ini; Map unit Karton -> PCS; Samakan nama ke format koma |
| 332 | Sedotan Warna Lurik Double 70gr | BJ000015 | Sedotan Warna Lurik Double 70gr | Pastikan hanya 1 produk memakai SKU ini; Map unit Pack -> PCS; Samakan nama ke format koma |

## Rekomendasi keputusan paling praktis
1. Lengkapi dulu 20 SKU yang kosong.
2. Untuk SKU duplikat, tentukan produk mana yang mempertahankan SKU lama dan mana yang mendapat SKU baru.
3. Untuk konflik dengan existing variant lain, anggap bentrok itu real kecuali kamu yakin dua nama itu sebenarnya satu produk yang sama.
4. Saat final import/update, semua nama dengan titik desimal akan dikoreksi ke format koma.
5. Saat final import/update, semua `Pack` dan `Karton` akan dipetakan ke `PCS`.

## Deliverable sesudah keputusan ini beres
Setelah 35 row ini diputuskan, langkah berikutnya adalah generate product SQL yang memisahkan:
- update existing variants yang aman
- insert variant baru yang benar-benar valid
- optional standardization update untuk nama produk