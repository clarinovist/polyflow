# Melindo Transactional Reset Execution Log

Updated: 2026-05-09
Executed by: Hermes via tenant-first production wrappers
Target tenant: `melindo`
Target DB: `melindo_rafia`

## 1. Scope executed
Reset transaksional tenant Melindo sambil mempertahankan master data inti.

Dipertahankan:
- `Account`
- `Product`
- `ProductVariant`
- `Customer`
- `Supplier`
- `User`
- `Location`

Dibersihkan:
- `JournalEntry`, `JournalLine`
- `Inventory`, `StockMovement`
- `SalesOrder`, `SalesOrderItem`
- `PurchaseOrder`, `PurchaseOrderItem`
- serta tabel transaksional related lain dalam script reset

## 2. Backup sebelum reset
Backup berhasil dibuat di VPS:
`/opt/backups/polyflow/manual/melindo_rafia-pre-reset-20260509_134501.dump`

Metadata backup:
- size: `1136776` bytes
- timestamp: `2026-05-09 13:45:02 +0200`

## 3. Pre-reset snapshot utama
Sebelum reset:
- `JournalLine` = 10177
- `StockMovement` = 9781
- `JournalEntry` = 1855
- `SalesOrderItem` = 1244
- `SalesOrder` = 352
- `Inventory` = 187
- `PurchaseOrderItem` = 7
- `PurchaseOrder` = 1

Master data sebelum reset:
- `Account` = 154
- `Product` = 4
- `ProductVariant` = 533
- `Customer` = 45
- `Supplier` = 10
- `User` = 1
- `Location` = 1

## 4. Reset execution result
Reset dijalankan lewat:
`./scripts/tenant-psql-write.sh melindo ./scripts/melindo-reset-transactional.sql`

Delete counts utama yang terkonfirmasi oleh PostgreSQL:
- `SalesOrderItem` -> 1244
- `PurchaseOrderItem` -> 7
- `SalesOrder` -> 352
- `PurchaseOrder` -> 1
- `StockMovement` -> 9781
- `Inventory` -> 187
- `JournalLine` -> 10177
- `JournalEntry` -> 1855

Transaction status:
- `BEGIN` … `COMMIT` sukses
- tidak ada error FK pada eksekusi final

## 5. Post-reset verification
Semua tabel transaksional target sudah `0`:
- `JournalEntry` = 0
- `JournalLine` = 0
- `Inventory` = 0
- `StockMovement` = 0
- `SalesOrder` = 0
- `SalesOrderItem` = 0
- `PurchaseOrder` = 0
- `PurchaseOrderItem` = 0
- seluruh kandidat tabel transaksi lain pada preflight juga = 0

Master data tetap utuh:
- `Account` = 154
- `Product` = 4
- `ProductVariant` = 533
- `Customer` = 45
- `Supplier` = 10
- `User` = 1
- `Location` = 1

## 6. Files created for this execution
- `/Users/nugroho/Documents/polyflow/scripts/melindo-reset-preflight.sql`
- `/Users/nugroho/Documents/polyflow/scripts/melindo-reset-transactional.sql`
- `/Users/nugroho/Documents/polyflow/docs/plans/2026-05-09-melindo-transactional-reset-plan.md`

## 7. Operational state after reset
Tenant Melindo sekarang berada pada kondisi:
- master data masih ada
- transaksi lama sudah dibersihkan
- inventory kosong
- journal kosong
- siap masuk fase fresh-start baru

## 8. Recommended next step
Jangan langsung operasi harian dulu. Putuskan salah satu:
1. benar-benar start dari nol total,
2. atau lanjut setup opening balance baru dengan pola yang benar.

Untuk fase berikutnya perlu ditentukan:
- apakah COA sekarang dipakai apa adanya,
- apakah product variants perlu dirapikan,
- apakah opening balance akan dimasukkan bertahap (cash/bank dulu, lalu inventory/AR/AP/FA),
- atau tenant dibiarkan kosong dulu sambil review master data.
