-- Migration: Add customer-specific tariffs
-- Date: 2026-08-05
-- Additive only. Existing tariffs (customerId=NULL) continue to apply to all customers.

ALTER TABLE "VehicleTariff" ADD COLUMN "customerId" TEXT;

ALTER TABLE "VehicleTariff"
  ADD CONSTRAINT "VehicleTariff_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "VehicleTariff_customerId_idx" ON "VehicleTariff"("customerId");
