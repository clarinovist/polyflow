-- AlterTable: Add location and photo fields to Customer
ALTER TABLE "Customer" ADD COLUMN "latitude" DECIMAL(10, 7);
ALTER TABLE "Customer" ADD COLUMN "longitude" DECIMAL(10, 7);
ALTER TABLE "Customer" ADD COLUMN "photoUrl" TEXT;
ALTER TABLE "Customer" ADD COLUMN "province" TEXT;
ALTER TABLE "Customer" ADD COLUMN "city" TEXT;
ALTER TABLE "Customer" ADD COLUMN "district" TEXT;
ALTER TABLE "Customer" ADD COLUMN "village" TEXT;
