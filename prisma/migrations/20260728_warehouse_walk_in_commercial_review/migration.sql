-- CreateEnum
CREATE TYPE "OrderEntrySource" AS ENUM ('STANDARD', 'WALK_IN_RECEIPT', 'EMERGENCY_DISPATCH');

-- CreateEnum
CREATE TYPE "CommercialReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN "entrySource" "OrderEntrySource" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "PurchaseOrder" ADD COLUMN "sourceReference" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "commercialReviewStatus" "CommercialReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "PurchaseOrder" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex: unique idempotencyKey per PO (nullable)
CREATE UNIQUE INDEX "PurchaseOrder_idempotencyKey_key" ON "PurchaseOrder"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- AlterTable: SalesOrder
ALTER TABLE "SalesOrder" ADD COLUMN "entrySource" "OrderEntrySource" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "SalesOrder" ADD COLUMN "sourceReference" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "commercialReviewStatus" "CommercialReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED';
ALTER TABLE "SalesOrder" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex: unique idempotencyKey per SO (nullable)
CREATE UNIQUE INDEX "SalesOrder_idempotencyKey_key" ON "SalesOrder"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;
