# PolyFlow Cost Guardrail Enhancements — Draft

> For Hermes: use this as a planning draft only. Do not execute code changes yet.

Tanggal: 2026-05-09
Context: hasil investigasi live Kiyowo menunjukkan perbedaan cost antar variant sering bukan bug formula, tapi kombinasi dari:
- source cost berbeda (`inventory.averageCost` vs `standardCost`)
- residue avg cost legacy pada stok kecil
- parameter BOM antar sibling tidak seragam (mis. scrap 15% / 5% / 0%)
- kurangnya warning/audit di UI saat user membuat atau recalc BOM

## Goal
Mengurangi kasus “harga per kg kok beda sendiri” dengan menambahkan guardrail di aplikasi, tanpa mengubah engine costing inti secara agresif.

## Opsi Enhancement

### Opsi A — Warning & Explainability Layer (recommended first)
Fokus: transparansi + pencegahan human error.

1. Tampilkan Cost Source di UI
- Product Detail
- BOM Detail
- HPP Calculator

Tambahkan label:
- Current Cost Source: Inventory Average / Standard Cost / Buy Price / Price
- Basis inventory qty
- Flag jika `avgCost` dan `standardCost` gap besar

2. Warning saat save / edit BOM
Rules contoh:
- sibling variant dalam family yang sama punya scrap berbeda signifikan
- sibling variant belum punya default BOM category yang sama
- input variant punya qty kecil tapi `avgCost` outlier vs `standardCost`

3. Family Consistency Panel
Di Product Detail / BOM area tampilkan matrix per sibling:
- variant
- default BOM ada/tidak
- scrap
- current cost
- standard cost
- gap %
- status OK / Warning

4. Cost anomaly report
Report read-only harian / halaman audit:
- avg cost vs standard cost gap > threshold
- qty kecil + avg cost ekstrem
- sibling family tidak seragam BOM/scrap

Pro:
- risiko implementasi rendah
- tidak mengubah formula cost existing
- paling cepat memberi value

Con:
- belum otomatis mencegah save jika user sengaja lanjut

### Opsi B — Soft Validation saat BOM save/recalc
Fokus: warning lebih tegas sebelum masalah masuk ke data.

Tambahan behavior:
- saat save BOM, server menghitung sibling mismatch
- kalau ada outlier, tampilkan blocking confirmation atau hard-stop (configurable)

Contoh rule:
- family yang sama, satu variant scrap 15% sementara sibling 0/5 tanpa justification
- recalc menghasilkan perubahan > X% dari median sibling
- ingredient current cost berasal dari inventory avg cost lawas dengan qty <= N

Pro:
- lebih preventif
- menahan kesalahan setup sejak awal

Con:
- butuh definisi rule bisnis yang jelas
- kalau terlalu ketat bisa ganggu operasional

### Opsi C — Policy Mode per Family
Fokus: enforce governance.

Tambah setting family/product group:
- costing policy = `UNIFORM_BOM` | `ALLOW_VARIANT_EXCEPTION` | `MANUAL_STANDARD_COST`
- anomaly threshold %
- require reason jika beda scrap / beda source cost

Pro:
- paling rapi jangka panjang
- cocok kalau PolyFlow mau lebih enterprise

Con:
- scope lebih besar
- butuh desain data model + admin UX

## Rekomendasi bertahap

### Phase 1 (paling worth it)
- Cost Source badge
- Cost Gap warning badge
- Family Consistency Panel
- Audit report / query page

### Phase 2
- Soft validation saat create/edit/recalc BOM
- warning jika scrap sibling tidak seragam
- warning jika cost source inventory berasal dari low-qty residue

### Phase 3
- Policy Mode per family
- exception reason logging

## Kandidat file yang kemungkinan tersentuh
- `src/lib/utils/current-cost.ts`
- `src/components/products/ProductDetail.tsx`
- `src/components/production/bom/BOMDetails.tsx`
- `src/components/production/bom/BOMForm.tsx`
- `src/actions/production/boms.ts`
- `src/services/production/bom-cost-cascade-service.ts`
- kemungkinan page baru audit costing di `src/app/finance/costing/...`

## Catatan desain penting
- Sebisa mungkin jangan ubah urutan fallback cost engine dulu.
- Mulai dari explainability + warning.
- Engine sekarang masih berguna; masalah utamanya user tidak diberi context kenapa angka berbeda.
- Guardrail terbaik pertama adalah “jelaskan source + tandai outlier”, bukan langsung override data.
