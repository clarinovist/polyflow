-- AlterTable: Add new fields to DeliveryOrder
ALTER TABLE "DeliveryOrder" ADD COLUMN "estimatedWeightKg" DECIMAL(10,2);
ALTER TABLE "DeliveryOrder" ADD COLUMN "destinationAddress" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "vehiclePhotoUrl" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "proofOfDeliveryUrl" TEXT;
ALTER TABLE "DeliveryOrder" ADD COLUMN "proofOfDeliveryAt" TIMESTAMP(3);
ALTER TABLE "DeliveryOrder" ADD COLUMN "receivedBy" TEXT;

-- AlterEnum: Add new status values (cannot be in transaction block for PostgreSQL)
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'LOADING';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'IN_TRANSIT';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'ARRIVED';

-- AlterTable: Add defaultVehicleId to Customer
ALTER TABLE "Customer" ADD COLUMN "defaultVehicleId" TEXT;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_defaultVehicleId_fkey" FOREIGN KEY ("defaultVehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
