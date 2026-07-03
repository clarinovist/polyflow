# Melindo Opening Balance — Journal Only Package

Status:
- Draft package refreshed against the latest balanced NERACA source
- Not executed to DB yet
- No suspense `MIG-DIFF` line is needed anymore
- `2-390 Hutang ke Nugroho Pramono` remains outside this journal package as a separate review bucket

## Core outputs

1. Raw journal-only lines (without module bridge):
- `melindo-opening-balance-journal-lines.csv`
- `melindo-opening-balance-journal-lines-summary.json`

2. Balanced draft with module bridge line:
- `melindo-opening-balance-journal-lines-balanced-draft.csv`
- `melindo-opening-balance-journal-lines-balanced-summary.json`

3. SQL drafts:
- `sql/melindo-opening-balance-journal-draft.sql`
- `sql/melindo-opening-balance-journal-draft-dry-run.sql`

## Why there is a module bridge line

The journal-only package intentionally excludes balances that should be opened through operational modules:
- AR
- AP
- Inventory
- Fixed Asset

So raw journal-only lines will not balance by themselves.

Raw journal-only result:
- line count: 19
- debit total: 819,356,831.56
- credit total: 1,196,367,460.17
- difference: -377,010,628.61

This difference represents the net opening effect of the excluded module buckets, after keeping owner liability outside the journal package.

To make the draft journal internally balanced for control/review purposes, one temporary bridge line is added:
- debit `1-199 Rekening Sementara`
- amount: 377,010,628.61

Balanced draft result:
- line count: 20
- total debit: 1,196,367,460.17
- total credit: 1,196,367,460.17
- difference: 0.00

## Important accounting interpretation

This bridge line is not “final truth”.
It is a migration control placeholder.

Intended lifecycle:
1. post journal-only package with bridge
2. later seed AR/AP/Inventory/FixedAsset openings through their modules or module-specific migration flows
3. owner liability `2-390` is reviewed and posted separately if approved
4. those module migrations must be designed to offset the bridge position in `1-199`
5. after all module openings are posted, `1-199` should return to zero unless a conscious temporary parking balance is still being used

## Refreshed source-balance treatment

The latest Google Sheet refresh removed the old source imbalance.

Current treatment:
- no suspense `MIG-DIFF` line is carried in the refreshed journal package
- `1-199` is used only for the temporary module bridge and the CIP temporary mapping (`1-121` -> `1-199`)
- this means any residual balance in `1-199` after module openings are posted should be investigated, not assumed to be acceptable

## Recommended next step

Do not execute this journal draft in isolation yet.
Best next move:
- generate AR opening package
- generate AP opening package
- generate inventory opening package
- generate fixed asset opening package
- then review how each one will relieve the `1-199` module bridge
