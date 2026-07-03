# Melindo BARANG JADI — Recommended Final Decisions

Berikut rekomendasi final yang siap dipakai sebagai basis eksekusi berikutnya.

## A. Pertahankan SKU existing, update nama ke format kanonik (5 rows)

| sourceRow | name | productCode | recommendedFinalSku | recommendedFinalName | recommendedFinalUnit | recommendationRationale |
| --- | --- | --- | --- | --- | --- | --- |
| 138 | Sedotan Bening Lurik Merah Dop Lancip Lubang 6 | SBLMDSL6 | SBLMDSL6 | Sedotan Bening Lurik Merah Dop Lancip Lubang 6 | KG | Produk existing yang sama; pertahankan SKU existing dan seragamkan nama ke format koma. |
| 207 | Sedotan Hitam Steril | SHS00WL-20 | SHS00WL-20 | Sedotan Hitam Steril | PCS | Produk existing yang sama; pertahankan SKU existing dan seragamkan nama ke format koma. |
| 209 | Sedotan Hitam Steril Bal Full Polos Isi 250 | SHS00WL-00 | SHS00WL-00 | Sedotan Hitam Steril Bal Full Polos Isi 250 | BAL | Produk existing yang sama; pertahankan SKU existing dan seragamkan nama ke format koma. |
| 217 | Sedotan Hitam Steril Full Printing | SHS00WL-11 | SHS00WL-11 | Sedotan Hitam Steril Full Printing | PCS | Produk existing yang sama; pertahankan SKU existing dan seragamkan nama ke format koma. |
| 332 | Sedotan Warna Lurik Double 70gr | BJ000015 | BJ000015 | Sedotan Warna Lurik Double 70gr | PCS | Produk existing yang sama; pertahankan SKU existing dan seragamkan nama ke format koma. |

## B. Assign SKU baru migration-safe (30 rows)

| sourceRow | name | productCode | recommendedFinalSku | recommendedFinalName | recommendedFinalUnit | recommendationRationale |
| --- | --- | --- | --- | --- | --- | --- |
| 80 | Rafia Merah Super 1 (6) |  | MLD-BJ-001 | Rafia Merah Super 1 (6) | BAL | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 82 | Rafia Netral |  | MLD-BJ-002 | Rafia Netral | KG | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 89 | Rafia Warna KW 0,2 (10) |  | MLD-BJ-003 | Rafia Warna KW 0,2 (10) | BAL | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 144 | Sedotan Bening Lurik Merah Putih Lancip Lubang 6 | SBLMDSL6 | MLD-BJ-004 | Sedotan Bening Lurik Merah Putih Lancip Lubang 6 | KG | Nama produk berbeda dari variant existing yang memakai SKU lama; assign SKU baru agar tidak bentrok. |
| 177 | Sedotan Biru Lurik Dop Lubang 6,5 |  | MLD-BJ-005 | Sedotan Biru Lurik Dop Lubang 6,5 | KG | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 194 | Sedotan Hijau Lurik Dop Lubang 6,5 |  | MLD-BJ-006 | Sedotan Hijau Lurik Dop Lubang 6,5 | KG | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 202 | Sedotan Hitam Lancip |  | MLD-BJ-007 | Sedotan Hitam Lancip | KG | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 203 | Sedotan Hitam Lancip Lubang 12 | BJ000015 | MLD-BJ-008 | Sedotan Hitam Lancip Lubang 12 | KG | Nama produk berbeda dari variant existing yang memakai SKU lama; assign SKU baru agar tidak bentrok. |
| 206 | Sedotan Hitam Lurik Dop Luban 6 Jasa |  | MLD-BJ-009 | Sedotan Hitam Lurik Dop Luban 6 Jasa | KG | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 208 | Sedotan Hitam Steril Bal Dalam Printing Luar Polos |  | MLD-BJ-010 | Sedotan Hitam Steril Bal Dalam Printing Luar Polos | BAL | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 210 | Sedotan Hitam Steril Bal Full Polos Isi 500 |  | MLD-BJ-011 | Sedotan Hitam Steril Bal Full Polos Isi 500 | BAL | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 213 | Sedotan Hitam Steril Full Polos | SHS00WL-00 | MLD-BJ-012 | Sedotan Hitam Steril Full Polos | PCS | Nama produk berbeda dari variant existing yang memakai SKU lama; assign SKU baru agar tidak bentrok. |
| 214 | Sedotan Hitam Steril Full Polos Isi 250 | SHS00WL-00 | MLD-BJ-013 | Sedotan Hitam Steril Full Polos Isi 250 | PCS | Nama produk berbeda dari variant existing yang memakai SKU lama; assign SKU baru agar tidak bentrok. |
| 215 | Sedotan Hitam Steril Full Polos Isi 500 | SHS00WL-00 | MLD-BJ-014 | Sedotan Hitam Steril Full Polos Isi 500 | PCS | Nama produk berbeda dari variant existing yang memakai SKU lama; assign SKU baru agar tidak bentrok. |
| 218 | Sedotan Hitam Steril Full Printing Isi 250 | SHS00WL-11 | MLD-BJ-015 | Sedotan Hitam Steril Full Printing Isi 250 | PCS | Nama produk berbeda dari variant existing yang memakai SKU lama; assign SKU baru agar tidak bentrok. |
| 219 | Sedotan Hitam Steril Full Printing Isi 500 | SHS00WL-11 | MLD-BJ-016 | Sedotan Hitam Steril Full Printing Isi 500 | PCS | Nama produk berbeda dari variant existing yang memakai SKU lama; assign SKU baru agar tidak bentrok. |
| 221 | Sedotan Hitam Steril Kura Isi 250 | SHS00WL-11 | MLD-BJ-017 | Sedotan Hitam Steril Kura Isi 250 | PCS | Nama produk berbeda dari variant existing yang memakai SKU lama; assign SKU baru agar tidak bentrok. |
| 222 | Sedotan Hitam Steril Kura Isi 500 | SHS00WL-11 | MLD-BJ-018 | Sedotan Hitam Steril Kura Isi 500 | PCS | Nama produk berbeda dari variant existing yang memakai SKU lama; assign SKU baru agar tidak bentrok. |
| 223 | Sedotan Hitam Steril Pack Polos Isi 250 | SHS00WL-20 | MLD-BJ-019 | Sedotan Hitam Steril Pack Polos Isi 250 | PCS | Nama produk berbeda dari variant existing yang memakai SKU lama; assign SKU baru agar tidak bentrok. |
| 227 | Sedotan Hitam Steril Zak Full Polos |  | MLD-BJ-020 | Sedotan Hitam Steril Zak Full Polos | ZAK | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 245 | Sedotan Kuning Lurik Dop Lubang 6,5 |  | MLD-BJ-021 | Sedotan Kuning Lurik Dop Lubang 6,5 | KG | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 274 | Sedotan Merah Lurik Dop Lubang 6,5 |  | MLD-BJ-022 | Sedotan Merah Lurik Dop Lubang 6,5 | KG | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 277 | Sedotan Merah Super 0,95 (10) |  | MLD-BJ-023 | Sedotan Merah Super 0,95 (10) | BAL | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 294 | Sedotan Pink Lurik Dop Lubang 6,5 |  | MLD-BJ-024 | Sedotan Pink Lurik Dop Lubang 6,5 | KG | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 302 | Sedotan Putih Dop Super 90gr |  | MLD-BJ-025 | Sedotan Putih Dop Super 90gr | PCS | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 311 | Sedotan Ungu Lurik Dop Lubang 6,5 |  | MLD-BJ-026 | Sedotan Ungu Lurik Dop Lubang 6,5 | KG | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 314 | Sedotan Ungu Super Jasa |  | MLD-BJ-027 | Sedotan Ungu Super Jasa | KG | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 323 | Sedotan Warna Lurik Dop 170gr |  | MLD-BJ-028 | Sedotan Warna Lurik Dop 170gr | PCS | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 325 | Sedotan Warna Lurik Dop 200gr |  | MLD-BJ-029 | Sedotan Warna Lurik Dop 200gr | PCS | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |
| 334 | Sedotan Warna Pop Ice Tumpul 130gr |  | MLD-BJ-030 | Sedotan Warna Pop Ice Tumpul 130gr | PCS | SKU kosong; buat SKU migration-safe baru agar import bisa jalan tanpa bentrok. |

Catatan: SKU baru memakai namespace `MLD-BJ-xxx` supaya aman, unik, dan tidak bentrok dengan SKU existing di DB. Ini paling aman untuk import awal; kalau nanti user ingin pola SKU bisnis yang lebih cantik, bisa direvisi belakangan dengan mapping yang terkontrol.