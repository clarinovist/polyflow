-- Migration: Add Fleet, Tariff, and Delivery Schedule models
-- Date: 2026-07-09
-- Apply to BOTH tenant databases: polyflow AND melindo_rafia

-- ==========================================
-- 1. CREATE ENUMS
-- ==========================================

CREATE TYPE "VehicleType" AS ENUM ('MOBIL_BOX', 'L300', 'COLD_CONTAINER', 'TRONTON', 'MOTOR', 'OTHER');
CREATE TYPE "OwnershipType" AS ENUM ('FACTORY', 'PRIVATE');
CREATE TYPE "VehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');
CREATE TYPE "RateType" AS ENUM ('PER_KG', 'FLAT_RATE');
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_TRANSIT', 'COMPLETED');

-- ==========================================
-- 2. CREATE VEHICLE TABLE
-- ==========================================

CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'OTHER',
    "ownershipType" "OwnershipType" NOT NULL DEFAULT 'PRIVATE',
    "ownerName" TEXT,
    "driverName" TEXT,
    "capacityKg" DECIMAL(10,2),
    "status" "VehicleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vehicle_plateNumber_key" ON "Vehicle"("plateNumber");

-- ==========================================
-- 3. CREATE VEHICLE TARIFF TABLE
-- ==========================================

CREATE TABLE "VehicleTariff" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "rateType" "RateType" NOT NULL DEFAULT 'PER_KG',
    "costRate" DECIMAL(15,2) NOT NULL,
    "chargeRate" DECIMAL(15,2) NOT NULL,
    "routeName" TEXT,
    "minKg" DECIMAL(10,2),
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleTariff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VehicleTariff_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "VehicleTariff_vehicleId_idx" ON "VehicleTariff"("vehicleId");

-- ==========================================
-- 4. CREATE DELIVERY SCHEDULE TABLE
-- ==========================================

CREATE TABLE "DeliverySchedule" (
    "id" TEXT NOT NULL,
    "scheduleNumber" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliverySchedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeliverySchedule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeliverySchedule_scheduleNumber_key" ON "DeliverySchedule"("scheduleNumber");

-- ==========================================
-- 5. CREATE JUNCTION TABLES
-- ==========================================

-- DeliveryScheduleVehicle: which vehicle is assigned to which schedule
CREATE TABLE "DeliveryScheduleVehicle" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryScheduleVehicle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeliveryScheduleVehicle_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "DeliverySchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryScheduleVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeliveryScheduleVehicle_scheduleId_vehicleId_key" ON "DeliveryScheduleVehicle"("scheduleId", "vehicleId");

-- DeliveryScheduleOrder: which delivery order is assigned to which schedule vehicle
CREATE TABLE "DeliveryScheduleOrder" (
    "id" TEXT NOT NULL,
    "scheduleVehicleId" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryScheduleOrder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DeliveryScheduleOrder_scheduleVehicleId_fkey" FOREIGN KEY ("scheduleVehicleId") REFERENCES "DeliveryScheduleVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryScheduleOrder_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DeliveryScheduleOrder_scheduleVehicleId_deliveryOrderId_key" ON "DeliveryScheduleOrder"("scheduleVehicleId", "deliveryOrderId");

-- ==========================================
-- 6. UPDATE DELIVERY ORDER: ADD VEHICLE + TARIFF SNAPSHOT
-- ==========================================

ALTER TABLE "DeliveryOrder" ADD COLUMN "vehicleId" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "appliedRateType" "RateType";
ALTER TABLE "DeliveryOrder" ADD COLUMN "appliedCostRate" DECIMAL(15,2);
ALTER TABLE "DeliveryOrder" ADD COLUMN "appliedChargeRate" DECIMAL(15,2);
ALTER TABLE "DeliveryOrder" ADD COLUMN "totalCost" DECIMAL(15,2);
ALTER TABLE "DeliveryOrder" ADD COLUMN "totalCharge" DECIMAL(15,2);

ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DeliveryOrder_vehicleId_idx" ON "DeliveryOrder"("vehicleId");
