# Location Role Mapping — Multi-Tenant

Source of truth for how **logical warehouse roles** map to real locations per tenant.
Implementation: `src/lib/locations/resolve-location.ts` + `src/lib/constants/locations.ts`.

## Why this doc exists

`locationPurpose` values (`PACKING`, `FINISHED_GOOD`, …) are **shared enums**, but
**operational meaning differs by tenant**. Treating them as identical causes wrong WO
output defaults (e.g. finished product landing in Melindo packaging-supplies warehouse).

---

## Logical roles

| Role             | Meaning in code                                                                   |
| ---------------- | --------------------------------------------------------------------------------- |
| `RAW_MATERIAL`   | Incoming raw materials                                                            |
| `MIXING`         | Mixing / adonan staging (or WIP fallback)                                         |
| `WIP`            | Work-in-progress / intermediate                                                   |
| `FINISHED_GOOD`  | Sellable or post-extrusion product warehouse                                      |
| `PACKING`        | Packing **process floor** _or_ packaging **supplies** warehouse (tenant-specific) |
| `SCRAP`          | Waste / afval                                                                     |
| `OPERATIONAL`    | Office / ATK (Melindo)                                                            |
| `CUSTOMER_OWNED` | Maklon customer-owned stock                                                       |

---

## Kiyowo (canonical film → bag)

| Role        | Location                 | Slug              | Purpose         | Typical stock                                                    |
| ----------- | ------------------------ | ----------------- | --------------- | ---------------------------------------------------------------- |
| RM          | Raw Material Warehouse   | `rm_warehouse`    | `RAW_MATERIAL`  | Resin, masterbatch                                               |
| MIXING      | Mixing Area              | `mixing_area`     | `MIXING`        | Intermediate compounds                                           |
| WIP         | WIP Storage              | `wip_storage`     | `WIP`           | Roll film pre-convert (often empty if FG holds rolls)            |
| **FG**      | Finished Goods Warehouse | `fg_warehouse`    | `FINISHED_GOOD` | **Roll film** (`FINISHED_GOOD` product type)                     |
| **PACKING** | Packing Area             | `packing_area`    | `PACKING`       | **Bags / packaging products** (`PACKAGING` type) + process floor |
| SCRAP       | Scrap Warehouse          | `scrap_warehouse` | `SCRAP`         | Afval                                                            |

### Flow

```text
RM → Mixing → Extrusion → FG (ROLL)
                            ↓ consume
                       Packing Area → PACKAGING products (bags)
```

- Packing **source** default: `FINISHED_GOOD` (consume rolls)
- Packing **output** default: `packing_area` (process floor / bag warehouse)

Maklon slugs: `maklon_raw_material`, `maklon_wip`, `maklon_fg`, `maklon_packing`.

---

## Melindo Rafia (Indonesian slugs)

| Role        | Location                            | Slug                      | Purpose         | Typical stock                                                |
| ----------- | ----------------------------------- | ------------------------- | --------------- | ------------------------------------------------------------ |
| RM          | Gudang Bahan Baku                   | `gudang-bahan-baku`       | `RAW_MATERIAL`  | Biji plastik, pewarna                                        |
| MIXING      | _(no dedicated)_ → WIP              | `gudang-wip-intermediate` | `WIP`           | Adonan / intermediate                                        |
| WIP         | Gudang WIP & Intermediate           | `gudang-wip-intermediate` | `WIP`           | Campuran, WIP                                                |
| **FG**      | Gudang Barang Jadi & Hasil Produksi | `gudang-barang-jadi`      | `FINISHED_GOOD` | **Sellable FG** (rafia, sedotan, roll rafia)                 |
| **PACKING** | Gudang Bahan Pembantu & Pengemas    | `gudang-packaging`        | `PACKING`       | **Supplies only**: etiket, karung, karton, consumable pabrik |
| SCRAP       | Gudang Scrap / Afval                | `gudang-scrap`            | `SCRAP`         | Reject / recycle                                             |
| OPERATIONAL | Gudang ATK / Kantor                 | `gudang-atk-kantor`       | `OPERATIONAL`   | ATK kantor                                                   |

### Flow

```text
RM → WIP (mix) → Extrusion / production → FG (barang jual)
                                              ↑
                         packaging materials ← gudang-packaging (supplies, not output)
```

- Packing **source** default: `FINISHED_GOOD` (or WIP when staged)
- Packing **output** default: **`FINISHED_GOOD`**, **not** `gudang-packaging`
- Packaging material pick: `resolvePackagingSuppliesLocationId` → `gudang-packaging`

### Critical rule

`isPackagingSuppliesWarehouse(loc)` is **true** for Melindo `gudang-packaging`.

| Action                               | Allowed on supplies warehouse? |
| ------------------------------------ | ------------------------------ |
| Store etiket / karung / consumable   | Yes                            |
| WO packing **product** output        | **No** → use FG                |
| Default packing stage output resolve | FG                             |
| `isRiskyOutputLocation`              | **Yes (risky)**                |

---

## Code helpers

| Function                             | Use                                        |
| ------------------------------------ | ------------------------------------------ |
| `resolveLocationByRole`              | Map role → location (slug then purpose)    |
| `resolveSourceLocationId(stage)`     | Material pick default for WO stage         |
| `resolveOutputLocationId(stage)`     | WO output / destination default            |
| `isPackagingSuppliesWarehouse`       | Detect Melindo-style packaging supplies    |
| `resolvePackingProcessLocation`      | Process floor only (null if supplies-only) |
| `resolvePackagingSuppliesLocationId` | Where to take etiket/karung                |
| `isRiskyOutputLocation`              | Guard WO output (RM, inactive, supplies)   |
| `isInactiveLocation`                 | `[NONAKTIF]` / `inactive-*`                |

---

## Stage defaults (non-maklon)

| Stage     | Source       | Output (Kiyowo) | Output (Melindo) |
| --------- | ------------ | --------------- | ---------------- |
| mixing    | RM           | Mixing Area     | WIP              |
| extrusion | Mixing / WIP | FG              | FG               |
| packing   | FG           | Packing Area    | **FG**           |
| rework    | FG           | FG              | FG               |

---

## Product type notes

| Tenant  | Packing-related product type                                                       |
| ------- | ---------------------------------------------------------------------------------- |
| Kiyowo  | `PACKAGING` = finished bag SKUs in packing area                                    |
| Melindo | `AUXILIARY` / `OPERATIONAL` in packaging supplies; FG products are `FINISHED_GOOD` |

Do not assume `productType=PACKAGING` exists on Melindo.

---

## Ops hygiene

1. **Do not store WIP/intermediate long-term in FG** (Melindo). Transfer to `gudang-wip-intermediate`.
2. **Do not use inactive locations** (`[NONAKTIF]`, `inactive-*`) for new stock or WO output.
3. Open MIXING WOs should output to **WIP**, not FG.
4. After location model changes, re-check machines + open WO `locationId` (see `docs/runbooks/2026-07-20-melindo-location-remap.md`).

---

## Related

- `src/lib/locations/resolve-location.ts`
- `src/lib/locations/__tests__/resolve-location.test.ts`
- `docs/runbooks/2026-07-20-melindo-location-remap.md`
- `docs/runbooks/2026-07-25-melindo-location-hygiene.md` (stock + open WO cleanup)
