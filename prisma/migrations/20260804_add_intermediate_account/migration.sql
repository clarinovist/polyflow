-- Add dedicated inventory account for INTERMEDIATE products.
-- INTERMEDIATE previously mapped to WIP account (1-132/11320), causing
-- Dr and Cr to hit the same GL account on every movement → balance divergence.

-- Melindo format (1-xxx codes): insert 1-129 between FG (1-128) and Raw (1-130)
INSERT INTO "Account" (id, code, name, type, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '1-129', 'Persediaan Barang Setengah Jadi', 'ASSET', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Account" WHERE code = '1-129')
  AND EXISTS (SELECT 1 FROM "Account" WHERE code = '1-130')
  AND NOT EXISTS (SELECT 1 FROM "Account" WHERE code = '11310');

-- Kiyowo format (5-digit codes): insert 11325 between WIP (11320) and FG (11330)
INSERT INTO "Account" (id, code, name, type, "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, '11325', 'Semi-Finished Goods', 'ASSET', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Account" WHERE code = '11325')
  AND EXISTS (SELECT 1 FROM "Account" WHERE code = '11310')
  AND NOT EXISTS (SELECT 1 FROM "Account" WHERE code = '1-130');
