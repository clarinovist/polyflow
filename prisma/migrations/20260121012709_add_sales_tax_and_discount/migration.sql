-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "discountAmount" DECIMAL(15,2),
ADD COLUMN     "taxAmount" DECIMAL(15,2);

-- AlterTable
ALTER TABLE "SalesOrderItem" ADD COLUMN     "discountPercent" DECIMAL(5,2),
ADD COLUMN     "taxAmount" DECIMAL(15,2),
ADD COLUMN     "taxPercent" DECIMAL(5,2);
