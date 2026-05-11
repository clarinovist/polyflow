# Melindo Transactional Reset Plan

> Mode saat ini: PLAN ONLY. Belum ada write ke database `melindo_rafia`.

## Goal
Mengosongkan data transaksional tenant `melindo` / database `melindo_rafia` sambil mempertahankan master data yang masih berguna, sehingga tenant siap dipakai fresh-start dengan opening balance baru.

## Why this plan exists
Audit read-only pada 2026-05-09 menunjukkan:
- journal historis besar dan dominan `MANUAL_ENTRY`
- inventory quantity ada tapi valuation nol
- stock movement cost semuanya null
- sales order ada, tapi invoice/payment tidak terbentuk
- product variant banyak, tapi basis costing kosong

Kesimpulan audit: lebih aman reset transaksi daripada repair angka satu-satu.

## Scope decision

### Data yang DIPERTAHANKAN
- `Account`
- `Product`
- `ProductVariant`
- `Customer`
- `Supplier`
- `User`
- `Location`
- master lain yang tidak menyimpan transaksi operasional

### Data yang DIBERSIHKAN
Target utama:
- `JournalLine`
- `JournalEntry`
- `Inventory`
- `StockMovement`
- `SalesOrder`
- `SalesOrderItem`
- `PurchaseOrder`
- `PurchaseOrderItem`
- `Invoice`
- `Payment`
- `PurchaseInvoice`
- tabel transaksional lain yang FK-linked bila memang ada row

Candidate tambahan sesuai schema live:
- `DeliveryOrder`, `DeliveryOrderItem`
- `GoodsReceipt`, `GoodsReceiptItem`
- `PurchasePayment`
- `StockOpname`, `StockOpnameItem`
- `CostHistory`
- `SupplierProduct`
- `ProductionOrder`, `ProductionShift`, `ProductionMaterial`, `ProductionExecution`, `ProductionIssue`
- `MaterialIssue`
- `ScrapRecord`
- `QualityInspection`
- `MachineDowntime`
- `SalesReturn`, `SalesReturnItem`
- `PurchaseReturn`, `PurchaseReturnItem`
- `Batch`
- `FixedAsset`
- `Bom`, `BomItem`
- `SalesQuotation`, `SalesQuotationItem`
- `PurchaseRequest`
- `StockReservation`
- `WorkShift`

Catatan:
- final daftar delete harus diverifikasi terhadap schema live sebelum eksekusi
- jangan delete tabel master hanya karena namanya mirip

## Execution principles
1. Tenant-first: semua operasi harus target `melindo`
2. Backup wajib dulu
3. Ambil pre-reset snapshot counts
4. Hapus dengan urutan FK-safe dalam SATU transaction
5. Verifikasi post-reset counts
6. Jangan langsung isi opening balance di langkah reset yang sama; pisahkan fase reset vs fase rebuild

## Phase 0 — Preconditions
Sebelum write:
- user final confirm bahwa scope reset = transaksi saja
- user final confirm apakah COA dan master product/customer/supplier dipertahankan apa adanya
- pastikan wrapper `scripts/tenant-psql-write.sh melindo` yang dipakai, bukan raw psql

## Phase 1 — Backup

### Step 1.1 Backup tenant DB
Buat dump binary sebelum perubahan:
```bash
ssh nugrohopramono "mkdir -p /opt/backups/polyflow/manual"
ssh nugrohopramono "docker exec polyflow-db pg_dump -U polyflow -d melindo_rafia -Fc > /opt/backups/polyflow/manual/melindo_rafia-pre-reset-$(date +%Y%m%d_%H%M%S).dump"
```

### Step 1.2 Verifikasi backup
- file ada
- ukuran non-zero
- timestamp sesuai

## Phase 2 — Snapshot pre-reset
Ambil dan simpan ke file:
- count tiap tabel target delete
- count master data utama
- count inventory positive qty
- count journal entry / line
- count sales order / invoice / payment

Simpan output ke dokumen/runbook atau file audit SQL result.

## Phase 3 — Schema verification before delete
Karena schema tenant bisa punya drift, lakukan verifikasi live:
- tabel mana yang benar-benar ada
- tabel mana yang punya row
- FK mana yang mungkin memblokir delete order

Query minimal:
- daftar tabel transaksional yang ada
- row counts
- optional FK inspection kalau perlu

## Phase 4 — Reset execution (single transaction)
Pola eksekusi:
```sql
BEGIN;

-- Phase A: deepest child tables
DELETE FROM "SalesOrderItem";
DELETE FROM "PurchaseOrderItem";
DELETE FROM "DeliveryOrderItem";
DELETE FROM "GoodsReceiptItem";
DELETE FROM "PurchaseInvoice";
DELETE FROM "PurchasePayment";
DELETE FROM "ProductionMaterial";
DELETE FROM "ProductionExecution";
DELETE FROM "ProductionIssue";
DELETE FROM "MaterialIssue";
DELETE FROM "ScrapRecord";
DELETE FROM "QualityInspection";
DELETE FROM "MachineDowntime";
DELETE FROM "BomItem";
DELETE FROM "StockReservation";
DELETE FROM "StockOpnameItem";
DELETE FROM "SalesReturnItem";
DELETE FROM "PurchaseReturnItem";

-- Phase B: linked intermediate
DELETE FROM "DeliveryOrder";
DELETE FROM "GoodsReceipt";
DELETE FROM "Payment";
DELETE FROM "StockOpname";
DELETE FROM "CostHistory";
DELETE FROM "SupplierProduct";
DELETE FROM "SalesReturn";
DELETE FROM "PurchaseReturn";

-- Phase C: parent order tables
DELETE FROM "Invoice";
DELETE FROM "SalesOrder";
DELETE FROM "SalesQuotationItem";
DELETE FROM "SalesQuotation";
DELETE FROM "PurchaseOrder";
DELETE FROM "PurchaseRequest";

-- Phase D: inventory / production / assets
DELETE FROM "StockMovement";
DELETE FROM "Inventory";
DELETE FROM "Batch";
DELETE FROM "ProductionOrder";
DELETE FROM "ProductionShift";
DELETE FROM "WorkShift";
DELETE FROM "Bom";
DELETE FROM "FixedAsset";

-- Phase E: journal
DELETE FROM "JournalLine";
DELETE FROM "JournalEntry";

COMMIT;
```

Catatan penting:
- script final harus conditional terhadap tabel yang benar-benar ada
- jangan tempel SQL referensi ini mentah ke production tanpa verifikasi schema
- jika ada satu delete gagal, rollback seluruh transaction

## Phase 5 — Post-reset verification
Setelah commit, verifikasi:
- `JournalEntry`, `JournalLine`, `Inventory`, `StockMovement`, `SalesOrder`, `PurchaseOrder`, `Invoice`, `Payment`, `PurchaseInvoice` = 0
- `Account`, `Product`, `ProductVariant`, `Customer`, `Supplier`, `User`, `Location` tetap utuh
- login tenant masih bisa
- page master data tetap terbuka

## Phase 6 — Immediate aftercare
Setelah reset selesai, jangan langsung input operasi harian sebelum strategi fresh-start dipilih:

### Opsi aftercare A
Benar-benar nol total dulu, baru input master/cost/opening sedikit demi sedikit.

### Opsi aftercare B
Langsung lanjut opening balance fresh-start dengan pattern yang benar:
- inventory via stock-opname / seeded inventory strategy
- AR/AP via module docs, bukan journal dobel
- fixed asset via module, bukan jurnal dobel
- placeholder ke OBE bila diperlukan

## Specific risks for Melindo
1. COA saat ini bukan pola kode standar PolyFlow terbaru
   - perlu diputuskan: keep dulu atau normalisasi nanti
2. `ProductVariant` 533 item tanpa cost basis
   - reset transaksi tidak otomatis membuat costing sehat
3. `Inventory` saat ini qty>0 tapi value=0
   - setelah reset, inventory harus dianggap kosong / belum bernilai
4. `SalesOrder` historis mungkin masih berguna sebagai referensi bisnis
   - jika user masih butuh referensi, pertimbangkan export snapshot sebelum delete

## Recommended exact next move
Sebelum eksekusi delete, lakukan 2 hal tambahan:
1. Buat SQL preflight script yang mengecek tabel existing + row counts
2. Buat SQL reset script final yang hanya menyasar tabel yang confirmed ada

Baru setelah dua file itu direview, eksekusi write dilakukan.

## Success criteria
Reset dianggap sukses jika:
- semua tabel transaksional target kosong
- semua master data target tetap ada
- tenant masih bisa diakses
- kita siap lanjut ke fase fresh-start baru tanpa warisan angka lama
