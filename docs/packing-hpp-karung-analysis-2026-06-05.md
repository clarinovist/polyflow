# Analisis Packing Area, Laporan Produksi Bulanan, dan HPP Karung

Tanggal review: 2026-06-05  
Scope: audit source code PolyFlow terkait produksi `PACKING`, output barang jadi dari `Packing Area`, dan cara biaya karung masuk ke HPP Packing.

## 1. Ringkasan kebutuhan dari user

Rizal minta dua hal utama:

1. Bisa melihat **total hasil produksi barang jadi selama satu bulan** yang berasal dari **Packing Area**.
2. Harga karung per pcs harus masuk ke **HPP Packing**.

Contoh formula yang diharapkan:

```text
HPP Packing Merah = 15.000
Harga Karung / pcs = 1.650
Total HPP Barang Jadi = 16.650
```

Secara bisnis, karung adalah komponen biaya packing, jadi harus ikut membentuk HPP barang jadi hasil packing.

## 2. Kondisi sistem saat ini

### 2.1 Model data yang relevan

File utama:

- `prisma/schema.prisma`
- `src/services/production/*`
- `src/services/finance/cost-reporting-service.ts`
- `src/services/accounting/costing-service.ts`
- `src/actions/finance/hpp-calculator.ts`
- `src/lib/utils/hpp-calculator.ts`

Entitas penting:

| Entitas | Fungsi saat ini |
| --- | --- |
| `Bom` | Resep produksi. Punya `category`, termasuk `PACKING`. |
| `BomItem` | Komponen material BOM. Bisa berisi material packing kalau varian produknya dibuat. |
| `ProductionOrder` | Work order, punya `bomId`, `locationId`, `actualQuantity`, status, estimasi conversion cost. |
| `ProductionExecution` | Log hasil produksi operator/kiosk. Ada `quantityProduced`, `endTime`, operator/mesin. |
| `StockMovement` | Ledger stok. Output produksi dicatat sebagai `IN`; konsumsi material dicatat sebagai `OUT`. |
| `Inventory.averageCost` | Biaya rata-rata stok per varian per lokasi. |
| `ProductVariant.standardCost` | Fallback cost kalau tidak ada average cost. |

Kategori produk sudah mendukung `PACKAGING`, dan unit sudah mendukung `PACK` yang di-map ke `PCS`, serta `ZAK`.

### 2.2 Alur Packing saat ini

Di form create WO:

- Stage `packing` memakai BOM kategori `PACKING`.
- Source default material packing: `fg_warehouse`.
- Output default packing: `packing_area`.

File terkait:

- `src/app/planning/orders/create/production-order-form.tsx`
- `src/lib/constants/locations.ts`

Saat output produksi dicatat:

1. `ProductionExecutionService.addProductionOutput()` membuat `ProductionExecution`.
2. `actualQuantity` order dinaikkan.
3. `recordFinishedGoodsOutput()` menambah stok output ke lokasi order.
4. `backflushMaterials()` mengurangi material berdasarkan BOM/planned material.

File terkait:

- `src/services/production/execution-service.ts`
- `src/services/production/execution-output-posting.ts`
- `src/services/production/execution-material-consumption.ts`
- `src/services/production/execution-material-location.ts`

### 2.3 Perhitungan HPP/HPP produksi saat ini

Ada beberapa jalur costing:

| Jalur | File | Cara hitung |
| --- | --- | --- |
| Actual COGM per order | `src/services/production/cost-service.ts` | Total `StockMovement OUT` material + `estimatedConversionCost`, dibagi `actualQuantity`. |
| Cost accounting page | `src/services/accounting/costing-service.ts` | Material issue + machine cost + labor cost, dibagi output. |
| Finance cost report | `src/services/finance/cost-reporting-service.ts` | Material OUT + conversion cost. |
| HPP calculator | `src/actions/finance/hpp-calculator.ts`, `src/lib/utils/hpp-calculator.ts` | Simulasi HPP berdasarkan BOM item + benchmark labor/machine/overhead. |

Kesimpulan: secara konsep, **kalau karung dimasukkan sebagai BOM item PACKING**, HPP calculator dan cost report berbasis material movement bisa ikut menghitung karung.

## 3. Temuan penting / gap

### 3.1 Karung belum terlihat sebagai komponen BOM packing seed

Di seed saat ini, contoh BOM packing `Repacking Black 1kg` hanya memakai input `Black Jumbo Roll`.

File:

- `prisma/seed.ts`

Belum ada contoh item `Karung` sebagai produk `PACKAGING` yang masuk BOM packing.

Implikasi: sistem tidak akan otomatis memasukkan biaya karung ke HPP kalau karung tidak dibuat sebagai varian produk dan tidak dimasukkan ke BOM/planned material.

### 3.2 Resolver lokasi material PACKING terlalu kasar

Untuk order non-maklon kategori `PACKING`, `resolveMaterialLocation()` saat ini langsung mengarahkan semua material ke `fg_warehouse`.

File:

- `src/services/production/execution-material-location.ts`

Masalahnya, BOM packing bisa punya dua jenis material:

1. Barang setengah jadi / jumbo roll dari `fg_warehouse`.
2. Karung / packaging material yang kemungkinan ada di gudang raw material/packaging/purchasing, bukan `fg_warehouse`.

Kalau karung dimasukkan BOM tetapi stoknya bukan di `fg_warehouse`, backflush bisa gagal atau cost karung tidak terbaca dengan benar.

### 3.3 Transfer material ke Packing Area tidak sinkron dengan backflush

Dialog material untuk kategori `PACKING` memakai mode transfer: material dipindahkan dari source ke lokasi order, misalnya `packing_area`.

File:

- `src/components/production/order-detail/BatchIssueMaterialDialog.tsx`

Tetapi saat backflush, `resolveMaterialLocation()` untuk `PACKING` tetap memilih `fg_warehouse`, bukan `packing_area`.

Implikasi:

- Kalau stok sudah ditransfer ke `packing_area`, output production masih mencoba consume dari `fg_warehouse`.
- Ini berisiko menyebabkan insufficient stock atau pencatatan konsumsi dari lokasi yang salah.

### 3.4 Transfer stok tidak membawa `averageCost`

`transferStockBulk()` hanya memindahkan kuantitas. Destination inventory di-upsert tanpa menjaga `averageCost`.

File:

- `src/services/inventory/movement-service.ts`

Implikasi: kalau suatu material dipindahkan ke staging/packing area lalu dikonsumsi dari sana, cost bisa menjadi 0 atau fallback ke standard/buy price, bukan biaya aktual lokasi asal.

### 3.5 Output FG dihitung sebelum backflush material saat ini

Di `addProductionOutput()`, sistem memanggil `recordFinishedGoodsOutput()` dulu, baru `backflushMaterials()`.

File:

- `src/services/production/execution-service.ts`

Padahal `recordFinishedGoodsOutput()` menghitung unit cost via `ProductionCostService.calculateBatchCOGM()`, yang membaca material movement yang sudah ada.

Implikasi: output stock movement untuk batch saat ini bisa belum memasukkan konsumsi material yang baru dibackflush, termasuk biaya karung.

### 3.6 Laporan produksi bulanan khusus Packing Area belum ada

Halaman yang ada:

- `/production/history` hanya menampilkan 30 execution terakhir, belum filter bulan/lokasi/kategori.
- `/production/costing` dan `/finance/costing` lebih fokus cost, belum laporan total produksi packing bulanan.
- `CostReportingService.getFinishedGoodsCosting()` belum filter khusus `Bom.category = PACKING` dan `Location.slug = packing_area`.

File terkait:

- `src/app/production/history/page.tsx`
- `src/app/production/costing/page.tsx`
- `src/app/finance/costing/components/CostingDashboardClient.tsx`
- `src/services/finance/cost-reporting-service.ts`

### 3.7 `actualEndDate` tidak selalu otomatis terisi

Beberapa report memakai `ProductionOrder.actualEndDate`, tetapi output execution memakai `ProductionExecution.endTime`.

Di `stopExecution()` saat `completed = true`, status diubah ke `COMPLETED`, tapi `actualEndDate` tidak terlihat otomatis di-set.

Implikasi: report berdasarkan `actualEndDate` bisa miss data produksi yang sebenarnya sudah selesai/log output.

## 4. Rekomendasi implementasi

### Rekomendasi data/master dulu

Buat master varian karung:

| Field | Saran |
| --- | --- |
| `Product.productType` | `PACKAGING` |
| Nama | `Karung Merah` / `Karung Putih` / sesuai kebutuhan |
| Unit | `PACK`/PCS atau `ZAK`, tergantung operasional stok |
| `standardCost` atau `buyPrice` | `1650` untuk contoh Rizal |
| Stok awal | Masukkan via stock adjustment/opening balance dengan unit cost 1650 |

Lalu masukkan karung sebagai BOM item di BOM kategori `PACKING`.

Contoh:

```text
Output BOM: Packing Merah / barang jadi merah
Output qty: 1 pcs/bal/zak barang jadi
Item 1: Hasil proses sebelumnya = cost setara HPP Packing 15.000
Item 2: Karung Merah = qty 1 pcs, cost 1.650
Total HPP = 16.650
```

### Rekomendasi code phase 1: laporan produksi bulanan Packing Area

Buat service/action baru, contoh:

- `src/services/production/packing-report-service.ts`
- `src/actions/production/packing-report.ts`
- page opsional: `src/app/production/reports/packing-monthly/page.tsx`

Filter utama:

```text
ProductionExecution.status != VOIDED
ProductionExecution.endTime between start/end month
ProductionOrder.bom.category = PACKING
ProductionOrder.location.slug in ('packing_area', 'maklon_packing' jika maklon ikut dihitung)
```

Output laporan minimal:

| Kolom | Isi |
| --- | --- |
| Bulan/periode | Dari filter user |
| Produk barang jadi | `bom.productVariant.name` |
| SKU | `skuCode` |
| Qty produksi | Sum `ProductionExecution.quantityProduced` |
| Unit | `primaryUnit` dan/atau entered unit kalau ada |
| Jumlah WO | Distinct order |
| HPP/unit | Dari actual costing per WO atau stock movement output cost |
| Total HPP | Qty x HPP/unit |

Untuk rekonsiliasi stok, bisa tambahkan basis `StockMovement IN` output produksi sebagai pembanding.

### Rekomendasi code phase 2: pastikan karung masuk HPP aktual

Minimal fix yang disarankan:

1. Pastikan karung adalah `BomItem` pada BOM `PACKING`.
2. Ubah resolver material supaya tidak semua item PACKING dipaksa dari `fg_warehouse`.
3. Prioritaskan lokasi aktual/staging `packing_area` jika material sudah ditransfer ke sana.
4. Pastikan transfer stok membawa `averageCost` ke destination.
5. Ubah urutan output: backflush material dulu, baru hitung/record output FG, atau hitung output cost dengan memasukkan konsumsi material batch yang sedang diproses.

### Rekomendasi code phase 3: source location per material

Solusi paling rapi adalah menambahkan `sourceLocationId` pada `ProductionMaterial`.

Kenapa:

- Satu BOM packing bisa punya input dari lokasi berbeda:
  - jumbo/hasil proses sebelumnya dari `fg_warehouse` atau `packing_area`,
  - karung dari gudang packaging/raw material,
  - label/tali/aksesoris dari lokasi lain.
- Backflush harus consume dari lokasi yang sudah direncanakan, bukan tebak berdasarkan kategori BOM saja.

Konsekuensi:

- Perlu migration Prisma.
- Form create/update WO perlu simpan source location per planned material.
- Backflush pakai `ProductionMaterial.sourceLocationId` jika tersedia.

## 5. Acceptance criteria

### AC-1: HPP karung masuk HPP Packing

Data setup:

- Produk output: `Packing Merah`
- HPP material utama: `15.000`
- Karung: `1 pcs`, cost `1.650`

Ekspektasi:

```text
HPP Packing final = 15.000 + 1.650 = 16.650
```

Harus terlihat di:

- HPP calculator.
- Cost report produksi packing.
- Stock movement output cost barang jadi packing.
- Journal inventory/WIP yang relevan.

### AC-2: Laporan produksi bulanan Packing Area

Jika ada tiga output packing pada Juni 2026:

| Tanggal | Produk | Qty |
| --- | --- | ---: |
| 2026-06-01 | Packing Merah | 100 |
| 2026-06-12 | Packing Merah | 200 |
| 2026-06-20 | Packing Biru | 50 |

Ekspektasi laporan bulan Juni 2026:

| Produk | Total Qty |
| --- | ---: |
| Packing Merah | 300 |
| Packing Biru | 50 |

Filter harus berdasarkan `ProductionExecution.endTime`/stock movement date, bukan hanya `ProductionOrder.actualEndDate`, karena `actualEndDate` belum konsisten otomatis terisi.

### AC-3: Backflush lokasi benar

Untuk BOM packing:

- Jumbo roll bisa dikonsumsi dari `packing_area` kalau sudah ditransfer ke packing area, atau dari `fg_warehouse` kalau belum ada staging.
- Karung dikonsumsi dari lokasi stok karung yang benar.
- Cost karung yang dipakai adalah average/standard cost karung, bukan 0.

## 6. Risiko dan catatan safety

- Jangan langsung ubah data production tanpa target tenant/DB dan backup yang jelas.
- Perubahan schema seperti `ProductionMaterial.sourceLocationId` butuh migration dan UAT.
- Perubahan urutan backflush/output memengaruhi jurnal WIP dan inventory valuation, jadi harus dites dengan skenario existing.
- Jika ingin cepat untuk demo, bisa mulai dari data setup BOM karung + report read-only dulu, baru rapikan costing aktual.

## 7. File yang perlu disentuh kalau lanjut implementasi

Prioritas implementasi kecil:

1. `src/services/production/packing-report-service.ts` — service laporan baru.
2. `src/actions/production/packing-report.ts` — server action report.
3. `src/app/production/reports/packing-monthly/page.tsx` — halaman laporan.
4. `src/services/production/execution-material-location.ts` — perbaiki source location PACKING.
5. `src/services/inventory/movement-service.ts` — preserve average cost saat transfer.
6. `src/services/production/execution-service.ts` — review urutan backflush vs output costing.
7. `src/services/production/cost-service.ts` — pastikan perhitungan COGM final memasukkan karung dan exclude output FG sendiri.
8. `src/services/finance/cost-reporting-service.ts` — tambah filter kategori/lokasi untuk report packing.
9. `src/lib/schemas/production.ts` + `prisma/schema.prisma` — jika pakai source location per planned material.

## 8. Kesimpulan

Saya paham maksud Rizal dan secara sistem PolyFlow arahnya sudah dekat: HPP bisa dibentuk dari BOM + actual material movement. Tetapi untuk kasus karung di Packing, ada beberapa gap penting:

1. Karung harus dibuat sebagai produk `PACKAGING` dan masuk BOM `PACKING`.
2. Source location material packing belum cukup presisi untuk membedakan jumbo roll vs karung.
3. Cost output saat ini berisiko dihitung sebelum material backflush batch berjalan.
4. Laporan bulanan khusus hasil produksi `Packing Area` belum tersedia.

Rekomendasi saya: buat report read-only dulu, lalu rapikan alur HPP karung supaya HPP final seperti contoh `15.000 + 1.650 = 16.650` benar-benar tercatat di inventory dan costing.

---

## 9. Pendetailan source code per area

Bagian ini ditambahkan setelah review ulang source code. Nomor baris mengacu pada kondisi repo saat dokumen ini ditulis.

### 9.1 Skema database yang menentukan kemampuan HPP karung

File: `prisma/schema.prisma`

| Area | Baris | Detail teknis | Implikasi untuk karung |
| --- | ---: | --- | --- |
| `ProductVariant.standardCost` | 188-208 | Varian produk punya `standardCost`, `buyPrice`, `price`, `costingMethod`. | Karung bisa diberi `standardCost = 1650` atau cost dari inventory average. |
| Relasi varian ke BOM item | 210-211 | Varian bisa jadi output BOM (`productionBoms`) atau ingredient BOM (`ingredientInBoms`). | Karung harus masuk sebagai ingredient BOM Packing. |
| `Bom.category` | 267-279, 1041-1046 | BOM punya kategori `PACKING`. | HPP karung sebaiknya hanya dipastikan untuk BOM `PACKING`. |
| `BomItem.quantity` | 282-291 | Komponen BOM menyimpan `productVariantId`, `quantity`, `scrapPercentage`. | `quantity = 1` untuk karung per pcs/bal output. |
| `StockMovement.cost` | 294-305 | Setiap mutasi stok punya cost per unit. | Actual HPP akan valid kalau movement OUT karung punya `cost = 1650`. |
| `ProductionOrder.locationId` | 414-446 | WO punya lokasi output. | Packing output saat ini diarahkan ke `packing_area`. |
| `ProductionMaterial` | 545-557 | Planned material hanya menyimpan product + quantity, belum source location. | Ini gap utama untuk multi-lokasi: jumbo roll vs karung. |
| `ProductionExecution.endTime` | 559-588 | Output aktual ada di execution, termasuk quantity dan end time. | Laporan bulanan sebaiknya ambil dari execution, bukan hanya `actualEndDate`. |
| Product type `PACKAGING` | 1081-1088 | Tipe produk sudah ada `PACKAGING`. | Master karung tidak perlu enum baru. |
| Unit `PACK`/`ZAK` | 1091-1096 | Unit sudah ada `PACK @map("PCS")` dan `ZAK`. | Bisa pakai `PACK` untuk pcs karung, atau `ZAK` jika operasionalnya zak. |

Kesimpulan source schema: **tidak wajib tambah model untuk sekadar memasukkan karung ke HPP BOM**, tetapi akan lebih rapi jika `ProductionMaterial` ditambah `sourceLocationId` untuk membedakan lokasi konsumsi tiap material.

### 9.2 Data flow create WO Packing

File utama:

- `src/app/planning/orders/create/production-order-form.tsx`
- `src/services/production/order-service.ts`
- `src/actions/production/production.ts`

#### Frontend source/destination location

Di `production-order-form.tsx`:

- `resolveSourceLocationId()` baris 193-215:
  - stage `packing` non-maklon return `fgLoc` (`fg_warehouse`).
  - stage `packing` maklon return `maklonFgLoc || maklonWipLoc || customerOwnedLoc || fgLoc`.
- `resolveOutputLocationId()` baris 217-238:
  - stage `packing` non-maklon return `packingLoc` (`packing_area`).
  - stage `packing` maklon return `maklonPackingLoc || packingLoc`.
- `getBomWithInventory()` dipanggil di baris 245-285 untuk menghitung required material dan current stock berdasarkan **satu source location global**.

Gap:

- Form create WO hanya punya satu `materialSourceLocationId` global, padahal BOM packing bisa butuh:
  - jumbo/produk sebelumnya dari `fg_warehouse`,
  - karung dari lokasi packaging/raw material,
  - label/tali dari lokasi lain.
- `getBomWithInventory()` juga menerima satu `sourceLocationId`, sehingga stock check karung bisa salah jika stok karung tidak ada di `fg_warehouse`.

Catatan product picker:

- `ProductionOrderService.getInitData()` baris 16-66 mengambil `rawMaterials` hanya dari `Product.productType = RAW_MATERIAL` pada baris 37-47.
- Ini tidak menghalangi karung masuk BOM, karena BOM form memakai `getProductVariants()` dari `src/actions/production/boms.ts` yang mengambil semua varian produk.
- Tetapi untuk tambah material/substitute ad-hoc di dialog order, produk `PACKAGING` seperti karung bisa tidak muncul jika UI memakai list `rawMaterials`.
- Kalau karung perlu sering ditambahkan manual di WO, list material production sebaiknya diperluas menjadi `RAW_MATERIAL + PACKAGING + INTERMEDIATE/WIP` sesuai stage.

#### Service create order

Di `order-service.ts`:

- `getBomWithInventory()` baris 72-159:
  - Ambil BOM items.
  - Ambil inventory hanya di `sourceLocationId` yang dikirim.
  - Return `requiredQty` per item.
- `createOrder()` baris 164-250+:
  - Kalau `data.items` kosong, material dibuat dari BOM item di baris 197-209.
  - Stock availability awal dicek terhadap `locationId` order di baris 212-230.

Gap:

- Cek stock awal pakai `locationId` output order, bukan source material yang dipilih. Untuk Packing, output `locationId = packing_area`, sementara material awal kemungkinan di `fg_warehouse` atau gudang packaging.
- `ProductionMaterial` yang dibuat tidak menyimpan source location, jadi saat backflush sistem harus menebak lagi.

### 9.3 Data flow issue/transfer material sebelum output

File utama:

- `src/components/production/order-detail/BatchIssueMaterialDialog.tsx`
- `src/services/inventory/movement-service.ts`
- `src/services/production/material-service.ts`

#### Dialog material transfer

Di `BatchIssueMaterialDialog.tsx`:

- Default source untuk `PACKING` = `fg_warehouse` pada baris 53-57.
- `isTransferMode` true untuk kategori `MIXING`, `EXTRUSION`, `PACKING`, `REWORK` pada baris 70-73.
- Jika transfer mode, item dipindahkan ke `order.location.id` pada baris 255-265.
- Setelah transfer, `batchIssueMaterials()` dipanggil dengan `items: []` untuk sinkronisasi plan saja pada baris 271-288.

Gap:

- UI menganggap packing material dipindahkan dulu ke `packing_area`, tetapi backend backflush masih bisa memilih `fg_warehouse` untuk `PACKING`.
- Perubahan source per item (`sourceLocationId`) hanya dipakai saat transfer saat itu, tidak dipersist ke `ProductionMaterial`.
- Produk tambahan/substitute di dialog material bergantung pada prop `rawMaterials`; dari service init saat ini list tersebut hanya `RAW_MATERIAL`, jadi karung bertipe `PACKAGING` perlu dipastikan tetap bisa dipilih kalau tidak sudah ada di BOM.

#### Transfer stock bulk tidak preserve cost

Di `movement-service.ts`:

- `transferStockBulk()` baris 95-185:
  - Lock source inventory quantity.
  - Decrement source quantity.
  - Upsert destination quantity.
  - Buat `StockMovement` type `TRANSFER`.
- Destination upsert baris 163-176 hanya update/create quantity, tidak membawa `averageCost`.

Gap:

- Kalau karung dipindah dari gudang packaging ke `packing_area`, `Inventory.averageCost` di `packing_area` bisa kosong.
- Saat backflush consume dari `packing_area`, cost bisa fallback ke `standardCost`/`buyPrice`, atau 0 kalau master cost belum benar.

Rekomendasi patch kecil:

```ts
// sebelum update source, ambil averageCost source
const sourceInventory = await tx.inventory.findUnique({
  where: { locationId_productVariantId: { locationId: sourceLocationId, productVariantId } },
  select: { quantity: true, averageCost: true }
});

const transferUnitCost = Number(sourceInventory?.averageCost ?? 0);

// destination upsert sebaiknya update WAC, bukan quantity only
await InventoryCoreService.incrementStockWithCost(
  tx,
  destinationLocationId,
  productVariantId,
  quantity,
  transferUnitCost
);
```

Catatan: source decrement tetap perlu dilakukan, dan transfer movement bisa menyimpan `cost: transferUnitCost` untuk audit.

### 9.4 Data flow output produksi dan backflush

File utama:

- `src/services/production/execution-service.ts`
- `src/services/production/execution-output-posting.ts`
- `src/services/production/execution-material-consumption.ts`
- `src/services/production/execution-material-location.ts`
- `src/services/production/cost-service.ts`

#### Urutan saat output manual/batch

Di `execution-service.ts`, `addProductionOutput()` baris 372-483:

1. Resolve qty output (`resolveOutputQuantity`) baris 382-392.
2. Buat `ProductionExecution` baris 405-443.
3. Update `ProductionOrder.actualQuantity` baris 445-455.
4. `recordFinishedGoodsOutput()` dipanggil baris 457-463.
5. `backflushMaterials()` dipanggil baris 465-472.
6. Scrap dicatat baris 474-482.

Masalah utama:

- Output FG dicatat **sebelum** material batch ini dibackflush.
- `recordFinishedGoodsOutput()` menghitung COGM dari stock movement yang sudah ada; jadi material movement karung yang baru dibuat pada backflush baris 465-472 belum masuk ke unit cost output pada baris 457-463.

Hal yang sama terjadi di:

- `stopExecution()` baris 259-275: output dulu, backflush setelahnya.
- `logRunningOutput()` baris 348-363: output dulu, backflush setelahnya.

#### Output posting menghitung COGM dari movement existing

Di `execution-output-posting.ts`:

- `recordFinishedGoodsOutput()` baris 9-49.
- Unit cost dihitung dengan `ProductionCostService.calculateBatchCOGM()` baris 24-27.
- Jika unit cost > 0, stok output di-increment dengan cost baris 31-35.
- Movement IN output menyimpan `cost: unitCost` baris 37-47.

Implikasi:

- Kalau `calculateBatchCOGM()` belum melihat movement OUT karung, output movement cost belum include karung.

#### Backflush material

Di `execution-material-consumption.ts`:

- Material yang dibackflush = `plannedMaterials` kalau ada, fallback ke `bom.items` baris 42-43.
- Lokasi konsumsi ditentukan per item oleh `resolveMaterialLocation()` baris 49-50.
- Ratio konsumsi dihitung dari `plannedQuantity` atau `bom.outputQuantity` baris 51-54.
- Stok dikurangi baris 60-61.
- Unit cost source diambil dari inventory average, fallback standard/buy price untuk non-maklon baris 9-26 dan 63.
- Movement OUT dibuat dengan `cost` baris 65-75.
- `MaterialIssue` dibuat baris 78-86.

Secara formula, kalau karung adalah item BOM:

```text
qtyToDeductKarung = totalConsumed * (karungQtyDiBOM / outputQuantityBOM)
```

Untuk output 1 pcs dan BOM karung qty 1:

```text
qtyToDeductKarung = 1 * (1 / 1) = 1 pcs
materialCostKarung = 1 * 1.650
```

Jadi rumus HPP bisa benar **asal** lokasi dan cost karung benar, dan movement OUT karung masuk sebelum output cost dihitung.

#### Resolver lokasi material

Di `execution-material-location.ts`:

- Non-maklon `MIXING`/`EXTRUSION` langsung return `mixing_area` baris 119-123.
- Non-maklon `PACKING`/`REWORK` langsung return `fg_warehouse` baris 124-128.
- Baru setelah itu cek inventory di order location baris 131-143.

Gap spesifik Packing:

- Karena `PACKING` langsung return `fg_warehouse`, sistem tidak sempat cek apakah karung ada di `packing_area` atau raw/packaging warehouse.
- Ini membuat semua item packing diperlakukan seperti barang setengah jadi dari FG.

Rekomendasi patch kecil tanpa migration:

```ts
if (order.bom?.category === 'PACKING' || order.bom?.category === 'REWORK') {
  // 1. prioritas stok di lokasi order/staging, karena UI transfer material ke order.location
  const orderLocationInventory = await findInventory(order.locationId, productVariantId);
  if (orderLocationInventory > 0) return order.locationId;

  // 2. lalu cari lokasi kandidat umum: FG, packing area, raw material
  const candidate = await findFirstStockLocation(tx, productVariantId, [
    WAREHOUSE_SLUGS.FINISHING,
    WAREHOUSE_SLUGS.PACKING_AREA,
    WAREHOUSE_SLUGS.RAW_MATERIAL,
  ]);
  if (candidate) return candidate;
}
```

Rekomendasi patch rapi dengan migration:

- Tambah `ProductionMaterial.sourceLocationId String?`.
- Backflush menerima `MaterialLike` yang punya optional `sourceLocationId`.
- `resolveMaterialLocation()` prioritas pertama memakai `item.sourceLocationId` jika tersedia.

### 9.5 Data flow HPP calculator/BOM standard cost

File utama:

- `src/actions/finance/hpp-calculator.ts`
- `src/lib/utils/hpp-calculator.ts`
- `src/actions/production/boms.ts`

#### HPP calculator

Di `hpp-calculator.ts`:

- `fetchHppBomSources()` ambil semua BOM dan semua items baris 18-65.
- Tiap item ambil `standardCost`, `buyPrice`, `price`, dan `inventories.averageCost` baris 42-58.
- `normalizeBomForHpp()` menghitung `currentMaterialCost` tiap item dengan `getCurrentUnitCost()` baris 75-80.
- `baselineMaterialPerUnit` dihitung dari total material / output qty baris 89-94.

Di `src/lib/utils/hpp-calculator.ts`:

- `calculateMaterialItemCost()` baris 81-85:

```text
unitCost * item.quantity * (1 + scrapPercentage/100)
```

- `calculateHppUnit()` baris 100-119:

```text
materialCost + laborCost + machineCost + overheadCost
```

Implikasi:

- Untuk simulasi HPP, karung otomatis masuk kalau karung ada sebagai `BomItem`.
- Contoh BOM output 1 pcs, item utama 15.000, item karung 1 x 1.650:

```text
materialCost = 15.000 + 1.650 = 16.650
```

#### BOM create/update update standard cost output

Di `src/actions/production/boms.ts`:

- `createBom()` membuat BOM item baris 127-141.
- Setelah create, total cost BOM dihitung baris 164-166.
- `updateStandardCost()` output variant dipanggil baris 168.
- `updateBom()` delete/recreate items baris 266-275.
- Update BOM juga hitung total cost dan update standard cost output baris 277-297.

Implikasi:

- Begitu karung dimasukkan ke BOM Packing, `standardCost` output packing akan ikut naik.
- Ini baik untuk HPP standard/simulasi.
- Tetapi actual output movement tetap perlu diperbaiki seperti bagian 9.4 agar historical actual HPP juga akurat.

### 9.6 Data flow laporan costing yang ada

File utama:

- `src/services/finance/cost-reporting-service.ts`
- `src/services/accounting/costing-service.ts`
- `src/actions/finance/finance.ts`
- `src/app/production/history/page.tsx`

#### Finance cost report

Di `cost-reporting-service.ts`:

- `getFinishedGoodsCosting()` baris 68-140+.
- Filter order saat ini hanya `status = COMPLETED` baris 69-71.
- Kalau date range ada, filter memakai `actualEndDate` baris 73-78.
- Ambil all movement OUT terkait order baris 99-114.
- Material cost dihitung dari `movement.cost * movement.quantity` baris 34-61.

Gap:

- Belum ada filter `bom.category = PACKING`.
- Belum ada filter `location.slug = packing_area`.
- Memakai `actualEndDate`, padahal output aktual ada di `ProductionExecution.endTime` dan `actualEndDate` belum konsisten di-set.

#### Accounting costing service

Di `src/services/accounting/costing-service.ts`:

- `calculateOrderCost()` baris 70-162 menghitung material issue + machine + labor.
- Material cost dipasangkan ke stock movement OUT lewat product/batch/location/qty/time baris 17-64.
- `getPeriodCosts()` baris 168-192 memakai `ProductionOrder.updatedAt`, bukan `actualEndDate` atau execution end time.

Gap:

- Cocok untuk cost sheet umum, tapi bukan report produksi bulanan Packing Area.
- Date basis `updatedAt` bisa berubah karena edit non-produksi.

#### Production history

Di `src/app/production/history/page.tsx`, saat ini query `ProductionExecution.findMany()` hanya:

- `endTime != null`
- order by `endTime desc`
- take 30

Gap:

- Belum ada filter month.
- Belum ada filter category/lokasi.
- KPI cards masih hardcoded/mock-ish seperti “24 Jobs”, “12,450”.

### 9.7 Source code plan implementasi yang disarankan

#### Phase A — report bulanan Packing Area, read-only, risiko rendah

Tambah file:

- `src/services/production/packing-report-service.ts`
- `src/actions/production/packing-report.ts`
- `src/app/production/reports/packing-monthly/page.tsx`

Query basis yang disarankan:

```ts
const executions = await prisma.productionExecution.findMany({
  where: {
    status: { not: 'VOIDED' },
    endTime: { gte: startDate, lte: endDate },
    productionOrder: {
      bom: { category: 'PACKING' },
      location: { slug: 'packing_area' },
    },
  },
  include: {
    productionOrder: {
      include: {
        bom: {
          include: { productVariant: { include: { product: true } } }
        },
        stockMovements: true,
      }
    }
  }
});
```

Aggregation:

```ts
key = outputVariantId
sumQty += Number(execution.quantityProduced)
orderIds.add(execution.productionOrderId)
```

Untuk HPP report:

- Ambil movement output `StockMovement IN` untuk order terkait dan output variant.
- Pakai weighted output cost:

```text
avgOutputHpp = sum(outputMovement.quantity * outputMovement.cost) / sum(outputMovement.quantity)
```

Catatan: kalau movement output cost historis belum akurat, tampilkan juga actual material cost/order dari `StockMovement OUT` sebagai kolom rekonsiliasi.

#### Phase B — masukkan karung ke standard HPP Packing

Tidak perlu code besar kalau data master sudah benar:

1. Buat produk karung tipe `PACKAGING`.
2. Set `standardCost`/`buyPrice`/inventory `averageCost = 1650`.
3. Masukkan ke BOM `PACKING` sebagai `BomItem.quantity = 1` per output unit.
4. Save BOM agar `updateStandardCost()` output variant ikut update.

#### Phase C — actual HPP karung masuk output movement

Patch minimal source:

1. `src/services/production/execution-material-location.ts`
   - Untuk `PACKING`, cek `order.locationId` dulu.
   - Lalu cek kandidat `fg_warehouse`, `packing_area`, `rm_warehouse`.
   - Jangan langsung return `fg_warehouse` tanpa cek stok item lain.

2. `src/services/inventory/movement-service.ts`
   - Preserve `averageCost` saat transfer.
   - Simpan `cost` pada movement `TRANSFER`.

3. `src/services/production/execution-service.ts`
   - Ubah urutan agar `backflushMaterials()` sebelum `recordFinishedGoodsOutput()`.
   - Risiko: jika output cost sebelumnya bergantung pada `actualQuantity` yang sudah diupdate, tetap update `actualQuantity` dulu, lalu backflush, lalu record output.

Urutan baru yang lebih benar:

```text
create/update execution
update actualQuantity
backflush materials -> creates OUT movements with karung cost
record finished goods output -> calculate COGM includes latest OUT movements
record scrap
```

Catatan penting: `calculateBatchCOGM()` membagi total material cost order dengan `actualQuantity`. Untuk partial output berkali-kali, metode ini bisa menghasilkan output movement cost yang berubah mengikuti total order, bukan pure batch-only. Ini masih lebih baik daripada cost belum include material terbaru, tetapi untuk akurasi batch-level idealnya perlu cost allocation per execution/output.

#### Phase D — source location per planned material, solusi robust

Migration:

```prisma
model ProductionMaterial {
  id                String          @id @default(uuid())
  productionOrderId String
  productVariantId  String
  quantity          Decimal         @db.Decimal(15, 4)
  sourceLocationId  String?
  sourceLocation    Location?       @relation(fields: [sourceLocationId], references: [id])
  ...

  @@index([sourceLocationId])
}
```

Schema/action update:

- `src/lib/schemas/production.ts`
  - `items[].sourceLocationId?: string`
  - `addedPlannedMaterials[].sourceLocationId?: string`
- `src/services/production/order-service.ts`
  - Saat create `ProductionMaterial`, simpan source location.
- `src/services/production/material-service.ts`
  - Saat update plan, preserve source location.
- `src/services/production/execution-types.ts`
  - `MaterialLike` include optional `sourceLocationId`.
- `src/services/production/execution-material-consumption.ts`
  - Prioritaskan `item.sourceLocationId` sebelum resolver tebak lokasi.

Manfaat:

- Karung bisa selalu consume dari lokasi packaging yang benar.
- Jumbo roll bisa consume dari FG/staging yang benar.
- Report variance material lebih mudah diaudit.

### 9.8 Test plan teknis

Minimal test yang perlu ditambah/update:

1. `src/services/production/__tests__/cost-service.test.ts`
   - Case: order PACKING dengan OUT material utama 15.000 dan OUT karung 1.650, actual qty 1, hasil COGM 16.650.

2. `src/services/__tests__/production-service.test.ts`
   - Case: `addProductionOutput()` memanggil `backflushMaterials()` sebelum `recordFinishedGoodsOutput()` atau memverifikasi output movement cost include material baru.

3. Test baru untuk `execution-material-location.ts`
   - Case non-maklon PACKING:
     - ada stok karung di `packing_area` -> return `packing_area`.
     - tidak ada di `packing_area`, ada di `fg_warehouse` -> return `fg_warehouse`.
     - karung hanya ada di `rm_warehouse` -> return `rm_warehouse`.

4. Test baru untuk `movement-service.transferStockBulk()`
   - Source inventory averageCost 1.650, transfer ke destination kosong.
   - Destination `averageCost` harus 1.650.

5. Test report baru:
   - Dua execution PACKING di bulan Juni + satu execution EXTRUSION.
   - Laporan hanya hitung dua PACKING dari `packing_area`.

### 9.9 Prioritas eksekusi kalau mau lanjut coding

| Prioritas | Change | Risiko | Alasan |
| --- | --- | --- | --- |
| P0 | Buat report bulanan Packing Area read-only | Rendah | Langsung menjawab kebutuhan “lihat total hasil produksi sebulan”. |
| P1 | Data setup karung sebagai `PACKAGING` + BOM item | Rendah-sedang | Membuat HPP standard/simulasi benar tanpa schema change. |
| P2 | Fix resolver lokasi PACKING + transfer preserve cost | Sedang | Membuat actual backflush karung lebih aman. |
| P3 | Ubah urutan backflush sebelum output cost | Sedang | Membuat movement output lebih mungkin include karung. Perlu test regresi. |
| P4 | Migration `ProductionMaterial.sourceLocationId` | Lebih tinggi | Solusi paling robust, tapi menyentuh schema, form, service, migration. |

Rekomendasi praktis: **P0 + P1 dulu**, lalu review hasil dengan data Rizal. Kalau sudah sesuai konsep, lanjut P2/P3 agar actual inventory valuation dan jurnal makin akurat.
