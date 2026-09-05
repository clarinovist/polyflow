-- Add material consumption location to ProductionOrder.
-- Additive and nullable: null keeps legacy behavior (fallback to locationId).
-- No data backfill — existing SPKs keep their current runtime behavior.

ALTER TABLE "ProductionOrder" ADD COLUMN "materialConsumptionLocationId" TEXT;

ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_materialConsumptionLocationId_fkey"
    FOREIGN KEY ("materialConsumptionLocationId") REFERENCES "Location"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
