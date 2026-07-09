-- AlterTable
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "destinationBank" TEXT;
