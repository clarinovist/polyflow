# Melindo Product Continuation Plan After Customer/Supplier Import

Status after latest audit:
- Customer import: done
- Supplier import: done
- Product import: not executed yet

## Verified DB facts

Current `melindo_rafia` product structure:
- Parent products:
  - `Produk FINISHED GOOD Rafia` -> 309 variants
  - `Produk INTERMEDIATE Rafia` -> 11 variants
  - `Produk PACKAGING Rafia` -> 103 variants
  - `Produk RAW MATERIAL Rafia` -> 110 variants
- Existing `ProductVariant.primaryUnit` values already in DB:
  - `KG`: 337
  - `BAL`: 70
  - `PCS`: 126

Important finding:
- Existing variants whose names contain `Pack` or `Karton` are already stored with unit `PCS`
- Example existing DB rows:
  - `Sedotan Hitam Steril Pack Printing Isi 250` -> `PCS`
  - `Karton Polos` -> `PCS`
  - `Karton Printing` -> `PCS`

This gives a strong operational signal that for Melindo data:
- `Pack` should normalize to `PCS`
- `Karton` should normalize to `PCS`

## New deliverables created

1. Product resolution worklist:
   - `/Users/nugroho/Documents/polyflow/docs/data-import/melindo-initial/melindo-barang-jadi-resolution-worklist.csv`

2. Product resolution summary:
   - `/Users/nugroho/Documents/polyflow/docs/data-import/melindo-initial/melindo-barang-jadi-resolution-summary.json`

3. Likely name-format-only matches:
   - `/Users/nugroho/Documents/polyflow/docs/data-import/melindo-initial/melindo-barang-jadi-likely-name-format-matches.csv`

## Resolution worklist summary

From 335 BARANG JADI rows:
- 263 already exist in DB by exact name
- 72 look new by exact name
- 20 missing `ProductCode`
- 15 rows involved in duplicate `ProductCode` inside the sheet
- 44 rows need unit normalization (`Pack`/`Karton` -> `PCS`)
- 52 rows use an SKU already present in DB under another existing variant name

## Key interpretation

The 52 SKU collisions are not all true conflicts.
A large subset is very likely only a name-format difference between sheet and DB.

Confirmed likely same-product formatting cases: 42 rows
Typical pattern:
- sheet: `Rafia Bening Super 0,75 (6)`
- DB:    `Rafia Bening Super 0.75 (6)`
- same SKU, same unit, only comma-vs-dot style difference

This means many rows that look "new by name" should probably be treated as:
- existing variants to update / canonicalize
- not inserted as separate new variants

## Recommended product strategy

### Phase A — Normalize sheet data first

1. Normalize unit mapping before import:
   - `Kg` -> `KG`
   - `Bal` -> `BAL`
   - `Pcs` -> `PCS`
   - `Zak` -> `ZAK`
   - `Pack` -> `PCS`
   - `Karton` -> `PCS`

2. Split rows into 4 operational buckets:
   - Bucket 1: exact-name existing rows -> update candidates
   - Bucket 2: likely same product, different name formatting -> canonicalization review
   - Bucket 3: true new rows with valid unique SKU -> insert candidates
   - Bucket 4: unresolved rows -> manual decision required

### Phase B — Manual decisions still required

Must be resolved before product import:
1. 20 rows with missing SKU
2. 15 duplicate-SKU rows inside the sheet
3. Remaining SKU collisions that are not clearly punctuation-only name differences
4. Which naming convention wins when sheet and DB differ only by comma/dot formatting

### Phase C — Only after cleanup, generate import SQL

After the above is resolved, create:
- product update SQL for exact/existing variants
- product insert SQL for truly new variants
- optional name-standardization SQL if you want DB naming to match spreadsheet style

## Practical recommendation

Do NOT import all 335 rows blindly.

Best next operational move:
1. Use `melindo-barang-jadi-likely-name-format-matches.csv` to quickly approve the 42 likely-same-product rows
2. Use `melindo-barang-jadi-resolution-worklist.csv` to fill missing SKU and resolve true duplicates
3. Then I generate a safe split import:
   - update existing variants
   - insert only genuinely new variants

## Suggested default rule unless you want otherwise

If you want me to proceed with the most conservative safe default, I will use this rule set:
- exact name match -> update existing
- same SKU + only formatting difference in name -> treat as existing, not new insert
- missing SKU -> hold
- duplicate SKU with different semantic product -> hold
- `Pack`/`Karton` -> map to `PCS`

That gives the safest path without creating accidental duplicate variants.
