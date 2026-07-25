# Runbook: Melindo location hygiene (FG / WIP / packing semantics)

**Date:** 2026-07-25  
**Host:** VPS `nugrohopramono` / DB `melindo_rafia`  
**Related:** `docs/LOCATION_TENANT_MAPPING.md`

## Goals

1. Document packing vs FG semantic split (Kiyowo process floor vs Melindo supplies).
2. Code: packing WO **output** on Melindo → FG, not `gudang-packaging`.
3. Data: move WIP/intermediate stock out of FG → WIP warehouse.
4. Data: open MIXING WOs sitting on FG → WIP.

## Code (repo)

- `src/lib/locations/resolve-location.ts` — `isPackagingSuppliesWarehouse`, packing output fix
- `src/lib/locations/__tests__/resolve-location.test.ts`
- `src/services/production/packing-report-service.ts` — multi-tenant location filter
- `docs/LOCATION_TENANT_MAPPING.md`

## Data ops executed on VPS

See session notes / SQL under “Execution” below.

### Transfer plan (FG → WIP)

All `Inventory` rows on `gudang-barang-jadi` where product type ∈ `WIP`, `INTERMEDIATE` (qty ≠ 0)
→ transfer to `gudang-wip-intermediate` with `StockMovement` reference `CUTOVER-FG-WIP:…`.

### Open WO remap

`ProductionOrder` with status ∉ COMPLETED/CANCELLED, BOM category `MIXING`, location = FG
→ `locationId` = WIP intermediate.

## Verify

```sql
-- No non-FG product types with qty on FG
SELECT p."productType", COUNT(*), SUM(i.quantity)
FROM "Inventory" i
JOIN "Location" l ON l.id = i."locationId"
JOIN "ProductVariant" pv ON pv.id = i."productVariantId"
JOIN "Product" p ON p.id = pv."productId"
WHERE l.slug = 'gudang-barang-jadi' AND i.quantity <> 0
  AND p."productType" NOT IN ('FINISHED_GOOD')
GROUP BY 1;

-- Open MIXING not on FG
SELECT po."orderNumber", b.category, l.slug, po.status
FROM "ProductionOrder" po
JOIN "Bom" b ON b.id = po."bomId"
JOIN "Location" l ON l.id = po."locationId"
WHERE po.status NOT IN ('COMPLETED','CANCELLED')
  AND b.category = 'MIXING'
  AND l.slug = 'gudang-barang-jadi';
```

Both should return **0 rows**.
