-- Phase M1: Expand schema for unified SO + quotation lifecycle (non-breaking)

-- 1) Add new enum values to SalesOrderStatus
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'QUOTATION';
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'QUOTATION_SENT';
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'QUOTATION_REJECTED';
ALTER TYPE "SalesOrderStatus" ADD VALUE IF NOT EXISTS 'QUOTATION_EXPIRED';

-- 2) Create SalesPriceStatus enum
DO $$ BEGIN
  CREATE TYPE "SalesPriceStatus" AS ENUM ('PENDING', 'PROVISIONAL', 'FINAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3) Quotation commercial fields on SalesOrder
ALTER TABLE "SalesOrder"
  ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subject" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT,
  ADD COLUMN IF NOT EXISTS "shippingTerms" TEXT,
  ADD COLUMN IF NOT EXISTS "termsConditions" TEXT,
  ADD COLUMN IF NOT EXISTS "priceStatus" "SalesPriceStatus",
  ADD COLUMN IF NOT EXISTS "quotationSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "legacyQuotationId" TEXT;

-- 4) Unique index for legacy quotation link
CREATE UNIQUE INDEX IF NOT EXISTS "SalesOrder_legacyQuotationId_key"
  ON "SalesOrder"("legacyQuotationId");

-- 5) Add isFreeItem to SalesOrderItem
ALTER TABLE "SalesOrderItem"
  ADD COLUMN IF NOT EXISTS "isFreeItem" BOOLEAN NOT NULL DEFAULT false;
