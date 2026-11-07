-- Additive: per-truck service reminders (oil, tyres, ...). Two new tables, no backfill, no
-- change to existing tables. Items are deactivated, never deleted; records keep the odometer evidence.

-- CreateTable
CREATE TABLE "VehicleServiceItem" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "intervalKm" DECIMAL(12,2) NOT NULL,
    "intervalDays" INTEGER,
    "warnKm" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleServiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleServiceRecord" (
    "id" TEXT NOT NULL,
    "serviceItemId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "servicedAt" TIMESTAMP(3) NOT NULL,
    "odometerKm" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleServiceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleServiceItem_vehicleId_label_key" ON "VehicleServiceItem"("vehicleId", "label");

-- CreateIndex
CREATE INDEX "VehicleServiceRecord_serviceItemId_servicedAt_idx" ON "VehicleServiceRecord"("serviceItemId", "servicedAt");

-- CreateIndex
CREATE INDEX "VehicleServiceRecord_vehicleId_idx" ON "VehicleServiceRecord"("vehicleId");

-- AddForeignKey
ALTER TABLE "VehicleServiceItem" ADD CONSTRAINT "VehicleServiceItem_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleServiceRecord" ADD CONSTRAINT "VehicleServiceRecord_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "VehicleServiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleServiceRecord" ADD CONSTRAINT "VehicleServiceRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Value contracts (also hold for writers that bypass the service layer).
ALTER TABLE "VehicleServiceItem" ADD CONSTRAINT "service_item_interval_km_positive"
    CHECK ("intervalKm" > 0 AND "intervalKm" <> 'NaN'::numeric);
ALTER TABLE "VehicleServiceItem" ADD CONSTRAINT "service_item_warn_km_nonnegative"
    CHECK ("warnKm" >= 0 AND "warnKm" <> 'NaN'::numeric);
ALTER TABLE "VehicleServiceItem" ADD CONSTRAINT "service_item_interval_days_positive"
    CHECK ("intervalDays" IS NULL OR "intervalDays" > 0);
ALTER TABLE "VehicleServiceRecord" ADD CONSTRAINT "service_record_odometer_nonnegative"
    CHECK ("odometerKm" >= 0 AND "odometerKm" <> 'NaN'::numeric);

-- A record must belong to the same vehicle as its service item, also for stale or direct writers.
CREATE FUNCTION guard_service_record_vehicle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT "vehicleId" FROM "VehicleServiceItem" WHERE id = NEW."serviceItemId") IS DISTINCT FROM NEW."vehicleId" THEN
    RAISE EXCEPTION 'Service record vehicle must match its service item vehicle';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "guard_service_record_vehicle" BEFORE INSERT OR UPDATE OF "serviceItemId", "vehicleId" ON "VehicleServiceRecord"
  FOR EACH ROW EXECUTE FUNCTION guard_service_record_vehicle();

-- An item with history cannot be moved to another vehicle.
CREATE FUNCTION guard_service_item_vehicle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."vehicleId" IS DISTINCT FROM OLD."vehicleId" AND
     EXISTS (SELECT 1 FROM "VehicleServiceRecord" WHERE "serviceItemId" = OLD.id) THEN
    RAISE EXCEPTION 'Service item with history cannot change vehicle';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "guard_service_item_vehicle" BEFORE UPDATE OF "vehicleId" ON "VehicleServiceItem"
  FOR EACH ROW EXECUTE FUNCTION guard_service_item_vehicle();
