-- Migration: rename Mixing Warehouse to Mixing Area (mixing_warehouse -> mixing_area)
-- Safe transactional script. Run in production with a DB backup.

BEGIN;

DO $$
BEGIN
  -- If mixing_warehouse exists and mixing_area does not, perform simple rename
  IF EXISTS (SELECT 1 FROM "Location" WHERE slug = 'mixing_warehouse')
     AND NOT EXISTS (SELECT 1 FROM "Location" WHERE slug = 'mixing_area') THEN
    UPDATE "Location"
    SET name = 'Mixing Area', slug = 'mixing_area'
    WHERE slug = 'mixing_warehouse';

  -- If both exist, migrate dependent foreign keys to the canonical mixing_area and remove old row
  ELSIF EXISTS (SELECT 1 FROM "Location" WHERE slug = 'mixing_warehouse')
     AND EXISTS (SELECT 1 FROM "Location" WHERE slug = 'mixing_area') THEN

    WITH old_loc AS (SELECT id FROM "Location" WHERE slug = 'mixing_warehouse' LIMIT 1),
         new_loc AS (SELECT id FROM "Location" WHERE slug = 'mixing_area' LIMIT 1)
    -- Update inventory
    UPDATE "Inventory" SET "locationId" = (SELECT id FROM new_loc) WHERE "locationId" = (SELECT id FROM old_loc);

    -- Update stock movements
    UPDATE "StockMovement" SET "toLocationId" = (SELECT id FROM new_loc) WHERE "toLocationId" = (SELECT id FROM old_loc);
    UPDATE "StockMovement" SET "fromLocationId" = (SELECT id FROM new_loc) WHERE "fromLocationId" = (SELECT id FROM old_loc);

    -- Update machines and production orders (common FK references)
    UPDATE "Machine" SET "locationId" = (SELECT id FROM new_loc) WHERE "locationId" = (SELECT id FROM old_loc);
    UPDATE "ProductionOrder" SET "locationId" = (SELECT id FROM new_loc) WHERE "locationId" = (SELECT id FROM old_loc);

    -- If there are other tables that reference locationId, add similar UPDATE statements here.

    -- Finally remove the old location row
    DELETE FROM "Location" WHERE slug = 'mixing_warehouse';
  END IF;
END$$;

COMMIT;
