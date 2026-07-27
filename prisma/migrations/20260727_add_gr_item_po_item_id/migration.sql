-- AlterTable: Add purchaseOrderItemId to GoodsReceiptItem
ALTER TABLE "GoodsReceiptItem" ADD COLUMN "purchaseOrderItemId" TEXT;

-- CreateIndex
CREATE INDEX "GoodsReceiptItem_purchaseOrderItemId_idx" ON "GoodsReceiptItem"("purchaseOrderItemId");
