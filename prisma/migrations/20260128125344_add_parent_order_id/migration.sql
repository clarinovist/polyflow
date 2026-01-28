-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "parentOrderId" TEXT;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_parentOrderId_fkey" FOREIGN KEY ("parentOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
