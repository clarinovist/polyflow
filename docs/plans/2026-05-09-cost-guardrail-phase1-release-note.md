# Cost Guardrail Phase 1 — Release Note

Tanggal: 2026-05-09
Status: implemented and build-verified
Area: costing, product detail, BOM, finance/costing audit

## Ringkasan

Phase 1 menambahkan transparansi source cost dan sinyal anomaly untuk bantu investigasi selisih costing antar variant/family, terutama kasus seperti perbedaan HPP per kg pada size tertentu yang ternyata berasal dari basis inventory average vs standard fallback.

Fokus phase ini bukan mengubah engine costing inti, tapi membuat penyebab selisih jadi terlihat lebih cepat di UI dan audit page.

## Problem yang disasar

Sebelumnya user hanya melihat angka current cost / HPP tanpa konteks:
- cost ini datang dari inventory average, standard cost, buy price, atau fallback lain?
- apakah gap vs standard cost masih wajar?
- apakah angka tinggi dipicu stok tipis / residue cost lama?
- apakah antar sibling variant dalam satu family ada pola tidak konsisten?

Akibatnya investigasi kasus seperti ORI 15 vs 21/24/28 atau UNGU 32 vs ukuran lain harus dibongkar manual lewat data inventory dan BOM satu per satu.

## Scope yang selesai

### 1. Shared cost diagnostics utility

File:
- `src/lib/utils/current-cost.ts`
- `src/lib/utils/cost-diagnostics.ts`
- `src/lib/utils/cost-audit.ts`

Kemampuan baru:
- identifikasi `CostSource` aktif:
  - `explicit_current_cost`
  - `inventory_average`
  - `standard_cost`
  - `buy_price`
  - `price`
  - `zero`
- hitung `gapPercent` terhadap standard cost
- deteksi anomaly flag:
  - `inventory_standard_gap`
  - `low_stock_cost_outlier`
- build audit rows + summary untuk kebutuhan reporting

### 2. Product Detail explainability

File:
- `src/actions/product.ts`
- `src/components/products/ProductDetail.tsx`

Perubahan:
- setiap variant di product detail sekarang membawa `costDiagnostics`
- card current cost menampilkan source badge + health badge + gap badge
- ada guardrail alert jika variant punya anomaly flag
- ada panel `Family Cost Consistency` untuk banding antar sibling variant dalam satu product family

Ini bikin review family seperti “kenapa size 15 mahal, size 21/24/28 lebih rendah” jauh lebih cepat.

### 3. BOM Details explainability

File:
- `src/actions/production/boms.ts`
- `src/components/production/bom/BOMDetails.tsx`

Perubahan:
- ingredient BOM sekarang menampilkan source cost badge
- gap terhadap standard cost per ingredient terlihat langsung
- ada anomaly badge per ingredient
- ada summary warning jika benchmark BOM dipengaruhi ingredient outlier

Ini membantu saat current benchmark cost BOM terlihat aneh karena salah satu material masih memakai inventory average dari stok tipis / residue lama.

### 4. BOM Form early warning

File:
- `src/components/production/bom/BOMForm.tsx`

Perubahan:
- saat menyusun/edit BOM, user langsung melihat source badge per material
- ada formula warning summary jika ada ingredient yang anomaly
- output product juga menampilkan basis source dan gap terhadap standard

Artinya warning pindah lebih awal ke tahap input, tidak hanya saat melihat hasil akhir.

### 5. Finance costing audit page

File:
- `src/app/finance/costing/page.tsx`

Perubahan:
- ditambahkan section `Cost Guardrail Audit`
- menampilkan KPI:
  - variants scanned
  - review needed
  - low stock outlier
  - inventory avg basis
  - standard fallback count
- tersedia quick filters:
  - All Variants
  - Review Needed
  - Inventory Avg
  - Standard Fallback
  - Low Stock Outlier
  - Std Gap
- tabel audit variant-level berisi:
  - product / variant
  - current cost
  - standard cost
  - source
  - stock qty / stock value
  - gap
  - status / flags

Page ini jadi titik review ringan untuk audit anomaly sebelum bongkar data inventory/BOM lebih dalam.

## Verifikasi yang sudah dilakukan

### Tests

Command:
- `npm test -- --run src/lib/utils/cost-audit.test.ts src/lib/utils/current-cost.test.ts src/lib/utils/cost-diagnostics.test.ts`

Hasil:
- 3 test files passed
- 13 tests passed

### Build

Command:
- `npm run build`

Hasil:
- pass
- Next.js compile + TypeScript + static generation berhasil

## File utama yang berubah

- `src/lib/utils/current-cost.ts`
- `src/lib/utils/current-cost.test.ts`
- `src/lib/utils/cost-diagnostics.ts`
- `src/lib/utils/cost-diagnostics.test.ts`
- `src/lib/utils/cost-audit.ts`
- `src/lib/utils/cost-audit.test.ts`
- `src/actions/product.ts`
- `src/actions/production/boms.ts`
- `src/components/products/ProductDetail.tsx`
- `src/components/production/bom/BOMDetails.tsx`
- `src/components/production/bom/BOMForm.tsx`
- `src/app/finance/costing/page.tsx`

## Dampak bisnis

Phase 1 belum memaksa koreksi data atau memblokir transaksi, tapi sudah sangat membantu untuk:
- membedakan mana cost yang memang valid vs mana yang kemungkinan bias residue stock
- menjelaskan kenapa variant family bisa tampak tidak konsisten
- mempercepat root-cause review untuk kasus BOM/HPP tanpa harus query data manual dari nol

## Yang sengaja belum dikerjakan di phase ini

- belum ada hard blocking saat save BOM kalau anomaly ditemukan
- belum ada family clustering / severity ranking yang lebih advanced di audit page
- belum ada drilldown langsung dari audit row ke histori stock movement penyebab gap
- belum ada auto-suggestion corrective action (mis. recalc, sync standard, cleanup residue stock)

## Rekomendasi Phase 2

1. Tambah severity ranking dan sorting by largest gap
2. Tambah grouping by product family di audit page
3. Tambah deep link dari audit row ke product detail / BOM detail
4. Tambah action hint per flag:
   - review residue stock
   - recalc cost chain
   - cek fallback standard cost
5. Pertimbangkan warning yang lebih tegas saat save BOM jika outlier material digunakan

## Kesimpulan

Cost Guardrail Phase 1 sudah usable, lolos build, dan siap dipakai untuk investigasi costing anomaly secara operasional. Nilai utamanya ada pada explainability: user sekarang bisa melihat bukan cuma “berapa harganya”, tapi juga “harga ini datang dari mana” dan “kenapa perlu direview”.
