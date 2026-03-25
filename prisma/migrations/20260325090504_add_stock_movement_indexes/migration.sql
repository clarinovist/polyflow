-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "type" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "StockMovement_productVariantId_idx" ON "StockMovement"("productVariantId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_fromLocationId_idx" ON "StockMovement"("fromLocationId");

-- CreateIndex
CREATE INDEX "StockMovement_toLocationId_idx" ON "StockMovement"("toLocationId");
