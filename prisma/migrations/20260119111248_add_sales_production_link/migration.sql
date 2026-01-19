-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "salesOrderId" TEXT;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
