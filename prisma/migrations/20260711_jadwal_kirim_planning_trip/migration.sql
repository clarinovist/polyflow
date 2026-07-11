-- ============================================
-- Jadwal Kirim Planning-First + Trip Model
-- ============================================
--
-- IMPORTANT: This migration has TWO parts due to PostgreSQL limitation:
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
--
-- PART 1 (manual): Run 01_enum_expansion.sql via psql BEFORE this migration.
-- PART 2 (automatic): This file handles all table changes (safe inside transaction).
--
-- For Docker deploy, add to entrypoint BEFORE prisma migrate deploy:
--   docker exec polyflow-db psql -U polyflow -d polyflow -f /app/prisma/migrations/20260711_jadwal_kirim_planning_trip/01_enum_expansion.sql
--   docker exec polyflow-db psql -U polyflow -d melindo_rafia -f /app/prisma/migrations/20260711_jadwal_kirim_planning_trip/01_enum_expansion.sql
-- ============================================

-- Create new enums (safe in transaction)
CREATE TYPE "TripStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'DEPARTED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ScheduleStopStatus" AS ENUM ('PLANNED', 'LINKED', 'GENERATED', 'CANCELLED');

-- ============================================
-- DeliveryScheduleVehicle → Trip model
-- ============================================

-- Add new columns
ALTER TABLE "DeliveryScheduleVehicle" ADD COLUMN "routeName" TEXT;
ALTER TABLE "DeliveryScheduleVehicle" ADD COLUMN "status" "TripStatus" NOT NULL DEFAULT 'PLANNED';
ALTER TABLE "DeliveryScheduleVehicle" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryScheduleVehicle" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill trip status from parent schedule
UPDATE "DeliveryScheduleVehicle" dsv
SET
  "status" = CASE
    WHEN ds.status = 'DRAFT' THEN 'PLANNED'::"TripStatus"
    WHEN ds.status IN ('CONFIRMED', 'IN_TRANSIT') THEN 'CONFIRMED'::"TripStatus"
    WHEN ds.status = 'COMPLETED' THEN 'COMPLETED'::"TripStatus"
    ELSE 'PLANNED'::"TripStatus"
  END,
  "updatedAt" = NOW()
FROM "DeliverySchedule" ds
WHERE dsv."scheduleId" = ds.id;

-- Drop old unique constraint, add new indexes
ALTER TABLE "DeliveryScheduleVehicle" DROP CONSTRAINT IF EXISTS "DeliveryScheduleVehicle_scheduleId_vehicleId_key";
CREATE INDEX IF NOT EXISTS "DeliveryScheduleVehicle_scheduleId_idx" ON "DeliveryScheduleVehicle"("scheduleId");
CREATE INDEX IF NOT EXISTS "DeliveryScheduleVehicle_vehicleId_departureDate_idx" ON "DeliveryScheduleVehicle"("vehicleId", "departureDate");
CREATE INDEX IF NOT EXISTS "DeliveryScheduleVehicle_status_idx" ON "DeliveryScheduleVehicle"("status");

-- ============================================
-- DeliveryScheduleOrder → Stop model
-- ============================================

-- Add new columns
ALTER TABLE "DeliveryScheduleOrder" ADD COLUMN "salesOrderId" TEXT;
ALTER TABLE "DeliveryScheduleOrder" ADD COLUMN "plannedWeightKg" DECIMAL(10, 2);
ALTER TABLE "DeliveryScheduleOrder" ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DeliveryScheduleOrder" ADD COLUMN "status" "ScheduleStopStatus" NOT NULL DEFAULT 'PLANNED';
ALTER TABLE "DeliveryScheduleOrder" ADD COLUMN "notes" TEXT;
ALTER TABLE "DeliveryScheduleOrder" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill salesOrderId from DeliveryOrder
UPDATE "DeliveryScheduleOrder" dso
SET
  "salesOrderId" = d."salesOrderId",
  "status" = 'LINKED'::"ScheduleStopStatus",
  "updatedAt" = NOW()
FROM "DeliveryOrder" d
WHERE dso."deliveryOrderId" = d.id
  AND dso."salesOrderId" IS NULL;

-- Drop old unique constraint
ALTER TABLE "DeliveryScheduleOrder" DROP CONSTRAINT IF EXISTS "DeliveryScheduleOrder_scheduleVehicleId_deliveryOrderId_key";

-- Make deliveryOrderId nullable
ALTER TABLE "DeliveryScheduleOrder" ALTER COLUMN "deliveryOrderId" DROP NOT NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS "DeliveryScheduleOrder_scheduleVehicleId_idx" ON "DeliveryScheduleOrder"("scheduleVehicleId");
CREATE INDEX IF NOT EXISTS "DeliveryScheduleOrder_salesOrderId_idx" ON "DeliveryScheduleOrder"("salesOrderId");
CREATE INDEX IF NOT EXISTS "DeliveryScheduleOrder_deliveryOrderId_idx" ON "DeliveryScheduleOrder"("deliveryOrderId");
CREATE INDEX IF NOT EXISTS "DeliveryScheduleOrder_status_idx" ON "DeliveryScheduleOrder"("status");

-- Add FK for salesOrderId
ALTER TABLE "DeliveryScheduleOrder" ADD CONSTRAINT "DeliveryScheduleOrder_salesOrderId_fkey"
  FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
