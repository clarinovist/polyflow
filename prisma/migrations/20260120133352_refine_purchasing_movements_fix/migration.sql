-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'PURCHASE';

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "goodsReceiptId" TEXT;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
