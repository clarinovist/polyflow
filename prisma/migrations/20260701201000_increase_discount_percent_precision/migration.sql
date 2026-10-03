-- AlterTable
ALTER TABLE "SalesQuotationItem" ALTER COLUMN "discountPercent" TYPE DECIMAL(15,6);

-- AlterTable
ALTER TABLE "SalesOrderItem" ALTER COLUMN "discountPercent" TYPE DECIMAL(15,6);

-- AlterTable
-- Guarded: "PurchaseOrderItem.discountPercent" was never added by any migration
-- in history (CREATE TABLE 20260120133156 has no such column; no ADD COLUMN for
-- PurchaseOrderItem exists anywhere in history). The column only exists on databases
-- built via `prisma db push`, so a from-scratch `migrate deploy` replay fails with
-- SQLSTATE 42703 (column does not exist). Add the column when missing, then
-- normalize the type to DECIMAL(15,6) per schema.prisma. Idempotent; safe to re-run.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'PurchaseOrderItem'
          AND column_name = 'discountPercent'
    ) THEN
        ALTER TABLE "PurchaseOrderItem" ADD COLUMN "discountPercent" DECIMAL(15,6);
    END IF;
    ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "discountPercent" TYPE DECIMAL(15,6);
END
$$;
