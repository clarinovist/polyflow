-- Add isFreeItem column to SalesOrderItem
ALTER TABLE "SalesOrderItem"
  ADD COLUMN IF NOT EXISTS "isFreeItem" BOOLEAN NOT NULL DEFAULT false;
