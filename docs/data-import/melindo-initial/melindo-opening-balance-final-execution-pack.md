# Melindo Opening Balance — Final Staging & Execution Pack

This pack assumes the latest refreshed migration approach:
- `1-121 Konstruksi dalam Pengerjaan` -> `1-199 Rekening Sementara`
- `2-390 Hutang ke Nugroho Pramono` -> keep separated as review bucket, not in journal-only draft
- `3-201b Laba Tahun Berjalan` -> `3-200b Laba Ditahan Rafia`
- zero-balance lines are preserved in some audit artifacts for traceability, but do not require DB effect
- source neraca is now balanced, so no `MIG-DIFF` suspense line is carried in the refreshed package

## Output files

Main staging:
- `melindo-opening-balance-final-staging.csv`
- `melindo-opening-balance-final-staging-summary.json`

Per execution bucket:
- `melindo-opening-balance-journal_only.csv`
- `melindo-opening-balance-ar_module.csv`
- `melindo-opening-balance-ap_module.csv`
- `melindo-opening-balance-inventory_module.csv`
- `melindo-opening-balance-fixed_asset_module.csv`
- `melindo-opening-balance-review_owner_liability.csv`

## Final staging summary

- Active rows before suspense: 37
- Final rows after suspense handling: 37
- Sum assets: 3,497,041,721.59
- Sum liabilities + equity: 3,497,041,721.59
- Source difference: 0.00
- Suspense posted to `1-199`: 0.00 (not needed)

Bucket counts:
- Journal only: 19
- AR module: 1
- AP module: 1
- Inventory module: 6
- Fixed asset module: 9
- Review owner liability: 1

## What each bucket means

### 1) Journal only
Safe to carry via opening journal / manual GL seeding:
- cash and bank
- prepaid tax / prepaid expense
- employee receivable
- temporary CIP parking
- tax liabilities that still remain non-zero
- retained earnings carry-forward

### 2) AR module
Use receivable opening workflow, not pure journal:
- trade receivables opening

### 3) AP module
Use payable opening workflow, not pure journal:
- trade payables opening

### 4) Inventory module
Use inventory opening workflow, not pure journal:
- finished goods inventory
- raw material inventory
- packaging inventory
- helper material inventory
- WIP inventory
- stationery inventory if treated as stocked item in operational setup

### 5) Fixed asset module
Use fixed asset opening workflow or dedicated migration journal package with asset register support:
- land
- building
- machinery
- vehicle
- office equipment
- accumulated depreciation balances

### 6) Review owner liability
Keep separated for deliberate confirmation and post outside the journal-only draft if approved:
- `2-390 Hutang ke Nugroho Pramono`

## Recommended execution order

1. Freeze the latest balanced staging file
2. Confirm whether `2-390` remains liability and whether it should be posted after journal-only phase
3. Seed journal-only bucket
4. Seed AR opening
5. Seed AP opening
6. Seed inventory opening
7. Seed fixed assets and accumulated depreciation
8. If approved, seed owner liability bucket separately
9. Reconcile resulting trial balance against staging totals

## Important accounting caution

The balanced neraca removes the old suspense blocker, but this does not eliminate review discipline.
The remaining caution is different:
- do not silently force `2-390` into the journal-only package without explicit confirmation
- keep module-routing boundaries clear so AR/AP/Inventory/Fixed Asset do not get double-counted
- keep the refreshed staging snapshot as the single source of truth for the next DB-writing phase

## Best next implementation step

Before writing DB-changing opening entries, the safest next action is to inspect how PolyFlow currently stores:
- journal entries / opening journals
- receivable openings
- payable openings
- inventory openings
- fixed asset balances

Then generate module-specific import/update scripts from these bucket CSVs.
