# Rencana Perbaikan: Pemakaian Karung Packing Berdasarkan BAL Utuh

Tanggal: 2026-06-07  
Scope: perbaikan logic pemakaian karung pada output hasil Packing agar tidak dihitung proporsional KG/base quantity.

## 1. Problem Statement

Saat ini material di proses produksi, termasuk `Karung Besar`, dibackflush memakai rumus proporsional:

```text
qty material = totalConsumedBaseQty × (plannedMaterialQty / plannedQuantity)
```

Akibatnya material karung bisa menjadi decimal, contoh dari screenshot:

```text
Karung Besar plan: 2.77 PACK
Karung Besar issued: 0.82 PACK
```

Ini tidak sesuai operasional karena karung fisik dipakai per pcs utuh.

## 2. Business Rule yang Diinginkan

Untuk output hasil Packing:

```text
Pemakaian Karung Besar = jumlah BAL utuh dari output yang diinput operator
```

Contoh:

```text
Output Hasil = 6,2 BAL
Karung Besar yang dipakai = 6 pcs/PACK
```

Rule pembulatan yang dimaksud saat ini:

```text
Karung Besar = floor(enteredQuantity BAL)
```

Artinya:

| Output Input | Karung Besar |
| ---: | ---: |
| 6,2 BAL | 6 PACK |
| 6,9 BAL | 6 PACK |
| 7,0 BAL | 7 PACK |

Catatan: jika nanti operasional memutuskan pecahan BAL tetap butuh karung tambahan, rule bisa diganti ke `ceil()`. Untuk sekarang berdasarkan contoh user, rule yang benar adalah `floor()`.

## 3. Prinsip Perbaikan

1. **Tidak ubah schema dulu**.
2. **Tidak seed angka permisalan ke production**.
3. Logic khusus hanya berlaku untuk:
   - BOM kategori `PACKING`, dan
   - material packaging/karung tertentu.
4. Material lain seperti roll/hasil proses sebelumnya tetap dihitung proporsional seperti sekarang.
5. Output cost/HPP tetap mengambil dari movement OUT setelah backflush, sehingga biaya karung utuh ikut masuk HPP.

## 4. Source Code Terkait

| Area | File | Kondisi Saat Ini |
| --- | --- | --- |
| Output produksi manual | `src/services/production/execution-service.ts` | Resolve `enteredQuantity`, `enteredUnit`, dan `baseQuantityProduced`, lalu panggil `backflushMaterials()`. |
| Backflush material | `src/services/production/execution-material-consumption.ts` | Semua material dihitung proporsional dari `totalConsumed`. |
| Type backflush order/material | `src/services/production/execution-types.ts` | `MaterialLike` belum include detail product type/unit/name. |
| Output dialog | `src/components/production/order-detail/AddOutputDialog.tsx` | Sudah mengirim `enteredQuantity` dan `enteredUnit` saat alternate unit dipakai. |
| Kiosk output | `src/components/production/kiosk/KioskLogOutputDialog.tsx`, `KioskStopDialog.tsx` | Juga mengirim `enteredQuantity` dan `enteredUnit` untuk alternate unit. |
| BOM/material data | `prisma/schema.prisma` | Product type `PACKAGING`, unit `PACK`, dan unit `BAL` sudah ada. |

## 5. Desain Perbaikan Teknis

### 5.1 Tambah payload ke `backflushMaterials()`

Tambahkan optional input:

```ts
backflushMaterials({
  ...,
  outputContext: {
    enteredQuantity: resolved.enteredQty,
    enteredUnit: resolved.enteredUnit,
    baseQuantity: resolvedBaseQty,
  }
})
```

Dipakai pada tiga flow:

1. `stopExecution()`
2. `logRunningOutput()`
3. `addProductionOutput()`

### 5.2 Enrich material yang dibackflush

Saat order di-include sebelum backflush, ubah include dari:

```ts
bom: { include: { items: true } },
plannedMaterials: true
```

menjadi include product variant minimal:

```ts
bom: {
  include: {
    items: {
      include: {
        productVariant: {
          include: { product: true }
        }
      }
    }
  }
},
plannedMaterials: {
  include: {
    productVariant: {
      include: { product: true }
    }
  }
}
```

Tujuannya agar backflush bisa mengenali material karung/packaging tanpa hardcode SKU.

### 5.3 Deteksi material karung/packaging

Fungsi helper yang disarankan:

```ts
function isWholeBalPackagingMaterial(item): boolean {
  const productType = item.productVariant?.product?.productType;
  const unit = item.productVariant?.primaryUnit;
  const name = item.productVariant?.name?.toLowerCase() || '';
  const sku = item.productVariant?.skuCode?.toLowerCase() || '';

  return productType === 'PACKAGING'
    && unit === 'PACK'
    && (name.includes('karung') || sku.includes('kar'));
}
```

Alasan tetap pakai `karung`/`kar`:

- Tidak semua packaging harus dihitung per BAL utuh. Misalnya label/tali/plastik bisa punya rule lain.
- Untuk phase awal, target spesifik adalah `Karung Besar`.

Alternatif lebih rapi jangka panjang:

- Tambah metadata di `ProductVariant.attributes`, contoh:

```json
{
  "consumptionRule": "FLOOR_ENTERED_BAL"
}
```

Tetapi untuk phase awal, deteksi nama/SKU cukup sebagai patch kecil tanpa migration.

### 5.4 Override qty material khusus karung

Di `backflushMaterials()`:

```ts
let qtyToDeduct = totalConsumed * ratio;

if (
  order.bom?.category === 'PACKING' &&
  outputContext?.enteredUnit === 'BAL' &&
  outputContext.enteredQuantity !== null &&
  isWholeBalPackagingMaterial(item)
) {
  qtyToDeduct = Math.floor(Number(outputContext.enteredQuantity));
}
```

Contoh:

```text
enteredQuantity = 6.2 BAL
qtyToDeduct Karung Besar = floor(6.2) = 6 PACK
```

Material lain tetap:

```text
qtyToDeduct Roll = totalConsumedBaseQty × ratio
```

## 6. Dampak ke HPP

Jika `Karung Besar` cost-nya sudah benar, misalnya `1.650`, maka movement OUT akan menjadi:

```text
Karung Besar OUT = 6 PACK × 1.650
```

Karena PR sebelumnya sudah mengubah urutan menjadi:

```text
backflush material dulu → record output FG
```

maka `ProductionCostService.calculateBatchCOGM()` akan membaca movement OUT karung dan memasukkannya ke HPP output.

## 7. Risiko dan Guardrail

| Risiko | Mitigasi |
| --- | --- |
| Salah deteksi packaging selain karung | Batasi rule ke `productType = PACKAGING`, `unit = PACK`, dan name/SKU mengandung `karung`/`kar`. |
| `enteredQuantity` tidak dikirim | Fallback ke rumus proporsional existing. |
| Output dicatat langsung dalam KG tanpa BAL | Fallback proporsional; perlu edukasi operator untuk input BAL jika ingin karung benar. |
| Pecahan BAL sebenarnya butuh karung tambahan | Konfirmasi rule bisnis. Saat ini pakai `floor` sesuai contoh. |
| Data historis lama tetap decimal | Tidak otomatis diperbaiki. Kalau perlu, buat script audit/recalculation terpisah dengan backup. |

## 8. Acceptance Criteria

### AC-1: Karung mengikuti BAL utuh

Input:

```text
BOM category = PACKING
Output enteredQuantity = 6.2
Output enteredUnit = BAL
Material Karung Besar productType = PACKAGING
Material Karung Besar primaryUnit = PACK
```

Expected:

```text
StockMovement OUT Karung Besar quantity = 6
MaterialIssue Karung Besar quantity = 6
```

### AC-2: Material non-karung tetap proporsional

Input sama, material `Roll Merah` tetap dihitung berdasarkan base quantity/KG dan ratio BOM.

Expected:

```text
StockMovement OUT Roll Merah quantity = hasil proporsional existing
```

### AC-3: HPP output include karung utuh

Jika:

```text
Karung Besar cost = 1.650
Karung Besar qty = 6
```

Expected:

```text
Material cost karung = 9.900
COGM/HPP output menyertakan 9.900
```

### AC-4: Fallback aman

Jika `enteredUnit` bukan `BAL` atau `enteredQuantity` kosong:

```text
Backflush tetap pakai rumus lama, tidak error.
```

## 9. Test Plan

Tambah/update test di:

```text
src/services/production/__tests__/packing-cost-resolution.test.ts
```

Test cases:

1. `PACKING + Karung Besar + enteredQuantity 6.2 BAL` → deduct `6 PACK`.
2. `PACKING + Karung Besar + enteredQuantity 7.0 BAL` → deduct `7 PACK`.
3. `PACKING + Roll Merah + enteredQuantity 6.2 BAL` → tetap proporsional.
4. `PACKING + Karung Besar tanpa enteredQuantity` → fallback proporsional.
5. `EXTRUSION + PACKAGING` → tidak memakai floor BAL rule.

## 10. Rekomendasi Eksekusi

Urutan aman:

1. Implement helper detection + outputContext di backflush.
2. Tambah unit tests.
3. Jalankan:

```bash
npm run test -- src/services/production/__tests__/packing-cost-resolution.test.ts
npx eslint src/services/production/execution-service.ts src/services/production/execution-material-consumption.ts src/services/production/execution-types.ts src/services/production/__tests__/packing-cost-resolution.test.ts
npx tsc --noEmit --pretty false
```

4. Deploy lewat PR/CI.
5. Uji di staging/production secara hati-hati dengan WO baru kecil.
6. Jangan ubah transaksi lama tanpa audit/backfill terpisah.

## 11. Kesimpulan

Perubahan ini perlu karena karung bukan material proporsional KG, melainkan packaging fisik per BAL utuh. Untuk contoh user:

```text
Output = 6,2 BAL
Karung Besar = 6 PACK
```

Solusi terbaik tanpa migration adalah menambahkan context output ke backflush dan override qty khusus material karung pada BOM `PACKING` memakai `Math.floor(enteredQuantity BAL)`.
