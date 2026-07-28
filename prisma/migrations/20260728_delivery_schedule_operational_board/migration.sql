-- Migration: Delivery Schedule Operational Board
-- Phase 1: Add transport mode, activity type, nullable vehicle, planned items
-- Backward-compatible: additive only, no drops

-- 1. Create new enums
CREATE TYPE "TransportMode" AS ENUM ('INTERNAL_FLEET', 'EXTERNAL_FLEET', 'CUSTOMER_PICKUP', 'TBD');
CREATE TYPE "ActivityType" AS ENUM ('DELIVERY', 'PICKUP_LOAD', 'BACKHAUL', 'OTHER');

-- 2. Alter DeliveryScheduleVehicle
-- Make vehicleId nullable (for EXTERNAL_FLEET, CUSTOMER_PICKUP, TBD)
ALTER TABLE "DeliveryScheduleVehicle" ALTER COLUMN "vehicleId" DROP NOT NULL;

-- Add new columns
ALTER TABLE "DeliveryScheduleVehicle" ADD COLUMN "transportMode" "TransportMode" NOT NULL DEFAULT 'INTERNAL_FLEET';
ALTER TABLE "DeliveryScheduleVehicle" ADD COLUMN "runNumber" TEXT;
ALTER TABLE "DeliveryScheduleVehicle" ADD COLUMN "externalProvider" TEXT;
ALTER TABLE "DeliveryScheduleVehicle" ADD COLUMN "externalPlate" TEXT;
ALTER TABLE "DeliveryScheduleVehicle" ADD COLUMN "externalDriver" TEXT;
ALTER TABLE "DeliveryScheduleVehicle" ADD COLUMN "cancelReason" TEXT;

-- 3. Alter DeliveryScheduleOrder
ALTER TABLE "DeliveryScheduleOrder" ADD COLUMN "activityType" "ActivityType" NOT NULL DEFAULT 'DELIVERY';
ALTER TABLE "DeliveryScheduleOrder" ADD COLUMN "activityLabel" TEXT;
ALTER TABLE "DeliveryScheduleOrder" ADD COLUMN "activityCustomer" TEXT;

-- 4. Create DeliveryScheduleOrderItem table
CREATE TABLE "DeliveryScheduleOrderItem" (
    "id" TEXT NOT NULL,
    "scheduleOrderId" TEXT NOT NULL,
    "salesOrderItemId" TEXT NOT NULL,
    "plannedQuantity" DECIMAL(15,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryScheduleOrderItem_pkey" PRIMARY KEY ("id")
);

-- 5. Add indexes for new columns
CREATE INDEX "DeliveryScheduleVehicle_transportMode_idx" ON "DeliveryScheduleVehicle"("transportMode");
CREATE INDEX "DeliveryScheduleVehicle_departureDate_idx" ON "DeliveryScheduleVehicle"("departureDate");
CREATE INDEX "DeliveryScheduleOrder_activityType_idx" ON "DeliveryScheduleOrder"("activityType");

-- 6. Add indexes for DeliveryScheduleOrderItem
CREATE INDEX "DeliveryScheduleOrderItem_scheduleOrderId_idx" ON "DeliveryScheduleOrderItem"("scheduleOrderId");
CREATE INDEX "DeliveryScheduleOrderItem_salesOrderItemId_idx" ON "DeliveryScheduleOrderItem"("salesOrderItemId");
CREATE UNIQUE INDEX "DeliveryScheduleOrderItem_scheduleOrderId_salesOrderItemId_key" ON "DeliveryScheduleOrderItem"("scheduleOrderId", "salesOrderItemId");

-- 7. Add foreign keys for DeliveryScheduleOrderItem
ALTER TABLE "DeliveryScheduleOrderItem" ADD CONSTRAINT "DeliveryScheduleOrderItem_scheduleOrderId_fkey"
    FOREIGN KEY ("scheduleOrderId") REFERENCES "DeliveryScheduleOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeliveryScheduleOrderItem" ADD CONSTRAINT "DeliveryScheduleOrderItem_salesOrderItemId_fkey"
    FOREIGN KEY ("salesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Backfill: existing trips with a vehicle → INTERNAL_FLEET (already default)
-- No data backfill needed — defaults handle legacy rows:
--   - transportMode defaults to INTERNAL_FLEET (correct for existing rows with vehicleId)
--   - activityType defaults to DELIVERY (correct for existing stops)

-- Note: vehicleId is now nullable but all existing rows have a value, so no NULLs to worry about.
