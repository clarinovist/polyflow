-- Additive: historical trips stay unknown, not zero kilometres.
ALTER TABLE "DeliveryScheduleVehicle"
  ADD COLUMN "plannedDistanceKm" DECIMAL(10,2),
  ADD COLUMN "distanceLegs" JSONB;
ALTER TABLE "DeliveryScheduleVehicle" ADD CONSTRAINT "trip_planned_distance_nonnegative"
  CHECK ("plannedDistanceKm" IS NULL OR ("plannedDistanceKm" >= 0 AND "plannedDistanceKm" <> 'NaN'::numeric));

CREATE TABLE "DeliveryRouteDistance" (
  "id" TEXT NOT NULL,
  "originAddress" TEXT NOT NULL,
  "destinationAddress" TEXT NOT NULL,
  "distanceKm" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryRouteDistance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "route_distance_positive" CHECK ("distanceKm" > 0 AND "distanceKm" <> 'NaN'::numeric)
);
CREATE UNIQUE INDEX "DeliveryRouteDistance_originAddress_destinationAddress_key"
  ON "DeliveryRouteDistance"("originAddress", "destinationAddress");

CREATE TABLE "VehicleTripMileage" (
  "id" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "driverName" TEXT NOT NULL,
  "odometerStart" DECIMAL(12,2) NOT NULL,
  "odometerEnd" DECIMAL(12,2),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "returnedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VehicleTripMileage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mileage_odometer_order" CHECK (
    "odometerStart" >= 0 AND "odometerStart" <> 'NaN'::numeric AND
    ("odometerEnd" IS NULL OR ("odometerEnd" >= "odometerStart" AND "odometerEnd" <> 'NaN'::numeric))
  ),
  CONSTRAINT "mileage_return_pair" CHECK (("odometerEnd" IS NULL) = ("returnedAt" IS NULL)),
  CONSTRAINT "VehicleTripMileage_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "DeliveryScheduleVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "VehicleTripMileage_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VehicleTripMileage_tripId_key" ON "VehicleTripMileage"("tripId");
CREATE INDEX "VehicleTripMileage_vehicleId_startedAt_idx" ON "VehicleTripMileage"("vehicleId", "startedAt");
-- A vehicle can have only one open odometer record, even under concurrent submissions.
CREATE UNIQUE INDEX "VehicleTripMileage_one_open_per_vehicle" ON "VehicleTripMileage"("vehicleId") WHERE "odometerEnd" IS NULL;

-- Existing schedule writers also obey the historical assignment invariant, including stale requests.
CREATE FUNCTION guard_trip_mileage_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "VehicleTripMileage" WHERE "tripId" = OLD.id) AND
    (NEW."vehicleId" IS DISTINCT FROM OLD."vehicleId" OR
     NEW."transportMode" IS DISTINCT FROM OLD."transportMode" OR
     NEW."departureDate" IS DISTINCT FROM OLD."departureDate" OR
     NEW."plannedDistanceKm" IS DISTINCT FROM OLD."plannedDistanceKm" OR
     NEW."distanceLegs" IS DISTINCT FROM OLD."distanceLegs" OR
     NEW.status NOT IN ('DEPARTED', 'COMPLETED')) THEN
    RAISE EXCEPTION 'Trip with odometer evidence cannot change assignment, departure, distance plan, or reopen';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "guard_trip_mileage_assignment" BEFORE UPDATE ON "DeliveryScheduleVehicle"
  FOR EACH ROW EXECUTE FUNCTION guard_trip_mileage_assignment();
