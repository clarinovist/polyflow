# Melindo Initial Import Staging Files

Generated from source workbook:
- Google Sheet ID: `1w3-a6OWxS42PpPlCz5cHxDwsBavY-HMZc56i8hOOzf8`
- Local audit copy: `/tmp/melindo_initial_data.xlsx`

## Files

1. `melindo-customers-staging.csv`
   - 146 cleaned customer rows
   - target table: `Customer`

2. `melindo-suppliers-staging.csv`
   - 53 cleaned supplier rows
   - target table: `Supplier`

3. `melindo-barang-jadi-issue-report.csv`
   - 64 flagged product issue rows
   - source sheet: `BARANG JADI`
   - this is not an import file; it is a cleanup worklist

4. `melindo-staging-summary.json`
   - machine-readable summary of staging outputs

## Cleaning rules applied

### Customer staging
- preserved `name`
- generated deterministic `code` with `CUS-` prefix
- normalized line breaks and repeated spaces
- lowercased email
- stripped Excel `.0` suffix from numeric-like tax IDs
- moved `PIC` into `notes`

### Supplier staging
- preserved `name`
- generated deterministic `code` with `SUP-` prefix
- normalized line breaks and repeated spaces
- lowercased email
- stripped Excel `.0` suffix from phone, tax, and bank account where applicable
- moved `PIC`, shipping address, and bank account holder into `notes`

### Product issue report
Rows are flagged when one or more conditions are true:
- missing `ProductCode`
- duplicate `ProductCode`
- unsupported unit (`Pack`, `Karton`)

## Current blockers before product import

- 20 rows missing `ProductCode`
- 5 duplicate product codes:
  - `BJ000015`
  - `SBLMDSL6`
  - `SHS00WL-00`
  - `SHS00WL-11`
  - `SHS00WL-20`
- unsupported units:
  - `Pack`: 27 rows
  - `Karton`: 17 rows

## Recommended next step

1. Review customer staging CSV
2. Review supplier staging CSV
3. Resolve all product issues in the issue report
4. Decide DB handling for units `Pack` and `Karton`
5. Only after that, generate import-ready product CSV / SQL for `melindo_rafia`
