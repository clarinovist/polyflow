-- AlterTable
ALTER TABLE "SalesQuotationItem" ALTER COLUMN "discountPercent" TYPE DECIMAL(15,6);

-- AlterTable
ALTER TABLE "SalesOrderItem" ALTER COLUMN "discountPercent" TYPE DECIMAL(15,6);

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "discountPercent" TYPE DECIMAL(15,6);
