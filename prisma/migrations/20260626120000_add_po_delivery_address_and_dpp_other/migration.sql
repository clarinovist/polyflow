-- AlterTable: Add deliveryAddress to PurchaseOrder
ALTER TABLE "PurchaseOrder" ADD COLUMN "deliveryAddress" TEXT;

-- AlterTable: Add dppOtherAmount to PurchaseOrderItem
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "dppOtherAmount" DECIMAL(15,2);
