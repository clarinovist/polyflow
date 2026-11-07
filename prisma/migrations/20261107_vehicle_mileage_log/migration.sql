-- Additive: odometer records no longer require a schedule trip. Existing rows and
-- constraints (order check, return pair, unique open record per vehicle, tripId unique,
-- guard trigger for linked trips) are untouched. Multiple NULL tripId rows are allowed.
ALTER TABLE "VehicleTripMileage" ALTER COLUMN "tripId" DROP NOT NULL;
ALTER TABLE "VehicleTripMileage" ADD COLUMN "note" TEXT;
