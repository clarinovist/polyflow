-- Link kebutuhan spare part maintenance ke varian stok (opsional). Additive only.
ALTER TABLE "MaintenanceSparePartNeed" ADD COLUMN "productVariantId" TEXT;
CREATE INDEX "MaintenanceSparePartNeed_productVariantId_idx" ON "MaintenanceSparePartNeed"("productVariantId");
ALTER TABLE "MaintenanceSparePartNeed" ADD CONSTRAINT "MaintenanceSparePartNeed_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON UPDATE CASCADE;
ALTER TABLE "MaintenanceSparePartNeed" ADD COLUMN "sourceLocationId" TEXT;
ALTER TABLE "MaintenanceSparePartNeed" ADD CONSTRAINT "MaintenanceSparePartNeed_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON UPDATE CASCADE;
