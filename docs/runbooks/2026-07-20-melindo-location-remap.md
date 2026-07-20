# Runbook: Melindo machine + open WO location remap

**Date:** 2026-07-20  
**Host:** VPS `nugrohopramono` / DB `melindo_rafia`  
**Related plan:** `docs/plans/2026-07-20-batch-transfer-source-destination-ux.md` (TAHAP 2 data ops)

## Why

- Melindo locations use Indonesian slugs + `locationPurpose`, not `mixing_area` / `rm_warehouse`.
- All 8 machines pointed at `[NONAKTIF] Gudang Utama` (`inactive-gudang-utama`).
- Open WOs had **Output Location = Gudang Bahan Baku** (or inactive), blocking staging transfer (source = dest).

## Mapping applied

| Entity | Rule | Target location |
|--------|------|-----------------|
| Machine `MIXER` | all | Gudang WIP & Intermediate (`gudang-wip-intermediate`) |
| Machine `EXTRUDER` | all | Gudang Barang Jadi (`gudang-barang-jadi`) |
| Open WO `MIXING` | status ∉ COMPLETED/CANCELLED | WIP intermediate |
| Open WO `EXTRUSION` | same | FG |
| Open WO `PACKING` | same | packaging (0 rows this run) |

**Not changed:** COMPLETED / CANCELLED historical WOs (83+ rows on inactive).

## Result (after)

### Machines (8)

| Machine type | Location |
|--------------|----------|
| Mixing 1–2 | Gudang WIP & Intermediate |
| Extruder KW 1–3, Sedotan 1/4, Super | Gudang Barang Jadi & Hasil Produksi |

### Open WOs (5)

| Order | Status | Category | Output after |
|-------|--------|----------|--------------|
| WO-260720-001 | WAITING_MATERIAL | MIXING | WIP intermediate |
| SWO-CB7C-MRQ1QWD5FES2J1 | DRAFT | MIXING | WIP intermediate |
| WO-MRQ18Z6M7R4DMS | IN_PROGRESS | MIXING | WIP intermediate |
| WO-MRQ17FA0JNGBUT | IN_PROGRESS | EXTRUSION | FG |
| SWO-CB7C-MRN8OFD12MQ0CX | DRAFT | MIXING | WIP intermediate |

## Notes / caveats

1. **Only `locationId` on Machine / ProductionOrder** was updated. Inventory stock rows were **not** moved. If material was already transferred into RM as “staging” for an IN_PROGRESS WO, ops may need a separate stock transfer.
2. `WO-MRQ18Z6M7R4DMS` is BOM category **MIXING** but machine **Extruder KW 3** — location set by BOM category (WIP). Review machine assignment if that WO is actually extrusion.
3. New WOs should get correct defaults from app code (`resolve-location.ts`) after deploy of commit `38c12916`+.

## Verify

```sql
-- machines should not reference inactive-*
SELECT m.name, m.type, l.slug
FROM "Machine" m
JOIN "Location" l ON l.id = m."locationId"
WHERE l.slug LIKE 'inactive-%';

-- open WOs should not be on RM or inactive
SELECT po."orderNumber", b.category, l.slug
FROM "ProductionOrder" po
JOIN "Bom" b ON b.id = po."bomId"
JOIN "Location" l ON l.id = po."locationId"
WHERE po.status NOT IN ('COMPLETED', 'CANCELLED')
  AND (l."locationPurpose" = 'RAW_MATERIAL' OR l.slug LIKE 'inactive-%');
```

Both queries should return **0 rows**.
