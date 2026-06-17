# Melindo Opening Balance Audit

Source workbook:
- `/tmp/melindo_initial_data.xlsx`
- Sheets audited: `NERACA MEI`, `LABA RUGI MEI`

## 1. What the sheets contain

### NERACA MEI
- 55 non-empty rows
- Looks like a balance-sheet snapshot per end of May 2026
- Contains:
  - cash/bank
  - receivables
  - prepaid tax / prepaid expense
  - inventories
  - fixed assets + accumulated depreciation
  - liabilities
  - equity

Key totals found on latest recheck:
- `TOTAL ASET` = 3,497,041,722
- `TOTAL HUTANG & EKUITAS` = 3,497,041,722
- Difference = 0 (sheet check cell evaluates `TRUE`; only tiny floating remainder in Excel)

This means the sheet is now **balanced enough to use as opening-balance source staging**, subject to normal account-mapping and module-routing review.

### LABA RUGI MEI
- 103 non-empty rows
- Looks like monthly P&L for May 2026
- Contains operating revenue, COGS, marketing/distribution, admin/general, tax/depreciation, other income/expense

Key totals found:
- `LABA BERSIH USAHA SETELAH PAJAK` = 54,000,366.24
- `LABA/RUGI BERSIH` = 53,909,462.82

### Cross-sheet note
- NERACA row `3-201b Laba Tahun Berjalan` latest value = 172,978,343.45
- LABA RUGI `LABA/RUGI BERSIH` = 53,909,462.82

So current earnings in NERACA still do **not** tie directly to the May P&L sheet.
This is no longer a balancing blocker, but it remains an accounting-classification/reconciliation note.

## 2. COA matching status against live DB

Matching output files:
- `melindo-financial-sheet-coa-match.csv`
- `melindo-financial-sheet-unmatched-suggestions.csv`

Summary:
- Total account rows extracted from both sheets: 124
- Direct/normalized matches to live DB COA: 71
- Unmatched by raw code: 53

But most unmatched rows are **not truly missing accounts**.
They are mostly old-vs-new tenant-specific code variants, especially suffix `b` rows in DB.

### High-confidence mapping pattern
Examples:
- `1-115 Piutang Dagang` -> `1-115b Piutang Dagang Rafia`
- `1-116 Pajak Dibayar Dimuka` -> `1-116b Pajak Dibayar Dimuka Rafia`
- `1-212 Bangunan` -> `1-212b Bangunan Rafia`
- `2-110 Hutang Dagang` -> `2-110b Hutang Dagang Rafia`
- `2-120 PPN Keluaran` -> `2-120b PPN Keluaran Rafia`
- `4-500b Potongan PPh Psl 4 (2)` -> `4-500b Potongan PPh Psl 4(2) Rafia`
- many `5-xxxb` and `6-xxxb` codes map similarly

### Accounts that need explicit human review
Some rows do not have a clean obvious target and should not be auto-mapped blindly.
Examples from the sheet:
- `1-121 Konstruksi dalam Pengerjaan`
- `1-124 Persediaan Hadiah`
- `3-201b Laba Tahun Berjalan`
- several `6-xxx` expense rows whose live DB naming/coding may differ

## 3. Operational conclusion

These sheets are **good reference material**, but they are **not import-ready** as direct opening balance.

Reasons these sheets still need staging discipline before DB execution:
1. NERACA is now balanced, but account mapping still must match live COA cleanly
2. NERACA current earnings do not reconcile directly to LABA RUGI
3. Raw sheet codes do not fully match live COA without mapping/translation
4. Some rows still require deliberate accounting decisions, not mechanical import

## 4. Safe strategy for Melindo opening balance

### Phase A — Refresh and confirm the reporting source
Before any DB opening-entry execution:
1. Lock the latest balanced `NERACA MEI` snapshot as the current source
2. Confirm the latest value for `3-201b Laba Tahun Berjalan`
3. Confirm policy for `2-390 Hutang ke Nugroho Pramono` (tetap review bucket terpisah)
4. Approve final account mapping for rows that are not direct code matches

### Phase B — Convert sheet into opening-balance staging
Produce a clean staging table with columns like:
- `sheet_code`
- `sheet_name`
- `mapped_db_code`
- `mapped_db_name`
- `amount`
- `classification`
- `opening_method`

`opening_method` should classify each line into one of:
- `JOURNAL_ONLY`
- `AR_MODULE`
- `AP_MODULE`
- `INVENTORY_MODULE`
- `FIXED_ASSET_MODULE`
- `REVIEW_REQUIRED`

### Phase C — Apply PolyFlow-safe opening-balance pattern
Per established PolyFlow safety rules:
- Do **not** directly duplicate balances for modules that will also be created through UI/module flows
- Route inventory / AR / AP / fixed asset through the proper opening-balance workflow to avoid double counting
- Use Opening Balance Equity as the bridging account where appropriate

## 5. Recommended next deliverable

The best next step is **not** direct posting.
The right next deliverable is:
- a mapped opening-balance staging file
- with account-by-account classification and module routing
- plus a short unresolved-issues list for the few lines that still need accounting judgment

## 6. Current recommendation

Proceed with this order:
1. build mapped staging from NERACA + LABA RUGI
2. isolate unresolved lines / mismatches
3. get approval on those lines
4. only then generate opening-balance SQL / module-seeding plan

This is the safest path and avoids pushing inconsistent accounting numbers into `melindo_rafia`.
