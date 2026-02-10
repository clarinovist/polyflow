-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN "productionOrderId" TEXT;

-- CreateIndex
CREATE INDEX "StockMovement_productionOrderId_idx" ON "StockMovement"("productionOrderId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
