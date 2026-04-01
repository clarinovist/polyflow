-- =============================================================
-- FIX SCRIPT: WO-260313-MIX51 Material Substitution
-- Mengganti HD 1 (160 KG) → HD TRANS (160 KG) di planned materials
-- dan transfer 160 KG HD TRANS dari Raw Material ke Mixing Area
-- =============================================================
-- WO ID:           7c7db777-c90e-49b7-9565-74d5fe2aeb43
-- HD 1 variant:    5fc56a9d-a649-4654-be01-40545adb299b
-- HD TRANS variant: b5b45f5d-55b7-4d8c-a7f7-9794bda116f9
-- Raw Material WH: 75ad437b-9b34-41e1-b427-7cb63e236247
-- Mixing Area:     0c882912-ebec-44e4-8431-bae328a11436
-- Planned Material HD 1 record: b0db98ff-9876-4159-8efa-788e4f2dc3f7
-- =============================================================

BEGIN;

-- 1. Update planned material: ganti HD 1 → HD TRANS
UPDATE "ProductionMaterial"
SET "productVariantId" = 'b5b45f5d-55b7-4d8c-a7f7-9794bda116f9'  -- HD TRANS
WHERE id = 'b0db98ff-9876-4159-8efa-788e4f2dc3f7'                -- planned material record for HD 1
  AND "productionOrderId" = '7c7db777-c90e-49b7-9565-74d5fe2aeb43';

-- 2. Deduct 160 KG HD TRANS dari Raw Material Warehouse
UPDATE "Inventory"
SET quantity = quantity - 160
WHERE "locationId" = '75ad437b-9b34-41e1-b427-7cb63e236247'      -- Raw Material WH
  AND "productVariantId" = 'b5b45f5d-55b7-4d8c-a7f7-9794bda116f9'; -- HD TRANS

-- 3. Add 160 KG HD TRANS ke Mixing Area (upsert via update since record exists with 0)
UPDATE "Inventory"
SET quantity = quantity + 160
WHERE "locationId" = '0c882912-ebec-44e4-8431-bae328a11436'      -- Mixing Area
  AND "productVariantId" = 'b5b45f5d-55b7-4d8c-a7f7-9794bda116f9'; -- HD TRANS

-- 4. Record stock movement: OUT dari Raw Material
INSERT INTO "StockMovement" (id, type, "productVariantId", "fromLocationId", quantity, reference, "createdAt", "updatedAt", "productionOrderId")
VALUES (
    gen_random_uuid(),
    'TRANSFER',
    'b5b45f5d-55b7-4d8c-a7f7-9794bda116f9',  -- HD TRANS
    '75ad437b-9b34-41e1-b427-7cb63e236247',   -- Raw Material WH
    160,
    'FIX-SCRIPT: Transfer HD TRANS for WO-260313-MIX51 (substitution HD 1 → HD TRANS)',
    NOW(), NOW(),
    '7c7db777-c90e-49b7-9565-74d5fe2aeb43'
);

-- 5. Record stock movement: IN ke Mixing Area
INSERT INTO "StockMovement" (id, type, "productVariantId", "toLocationId", quantity, reference, "createdAt", "updatedAt", "productionOrderId")
VALUES (
    gen_random_uuid(),
    'TRANSFER',
    'b5b45f5d-55b7-4d8c-a7f7-9794bda116f9',  -- HD TRANS
    '0c882912-ebec-44e4-8431-bae328a11436',   -- Mixing Area
    160,
    'FIX-SCRIPT: Transfer HD TRANS for WO-260313-MIX51 (substitution HD 1 → HD TRANS)',
    NOW(), NOW(),
    '7c7db777-c90e-49b7-9565-74d5fe2aeb43'
);

-- Verify results
SELECT '=== PLANNED MATERIALS ===' as info;
SELECT pm.id, pm.quantity, pv.name
FROM "ProductionMaterial" pm
JOIN "ProductVariant" pv ON pm."productVariantId" = pv.id
WHERE pm."productionOrderId" = '7c7db777-c90e-49b7-9565-74d5fe2aeb43'
ORDER BY pv.name;

SELECT '=== INVENTORY (Mixing Area) ===' as info;
SELECT i.quantity, pv.name
FROM "Inventory" i
JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
WHERE i."locationId" = '0c882912-ebec-44e4-8431-bae328a11436'
AND pv.name IN ('HD 1', 'HD TRANS', 'HD TRANS 2');

SELECT '=== INVENTORY (Raw Material) ===' as info;
SELECT i.quantity, pv.name
FROM "Inventory" i
JOIN "ProductVariant" pv ON i."productVariantId" = pv.id
WHERE i."locationId" = '75ad437b-9b34-41e1-b427-7cb63e236247'
AND pv.name IN ('HD 1', 'HD TRANS', 'HD TRANS 2');

COMMIT;
