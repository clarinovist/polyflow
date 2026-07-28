-- CreateEnum
CREATE TYPE "AttachmentCheckpoint" AS ENUM ('LOAD', 'UNLOAD', 'DAMAGE', 'RECEIPT', 'OPNAME');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PHOTO', 'SURAT_JALAN', 'NOTA_INVOICE', 'BERITA_ACARA', 'OTHER');

-- CreateTable
CREATE TABLE "WarehouseOperationalAttachment" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT,
    "goodsReceiptId" TEXT,
    "purchaseOrderId" TEXT,
    "stockOpnameId" TEXT,
    "stockOpnameItemId" TEXT,
    "checkpoint" "AttachmentCheckpoint" NOT NULL,
    "documentType" "DocumentType" NOT NULL DEFAULT 'PHOTO',
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "note" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarehouseOperationalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarehouseOperationalAttachment_deliveryOrderId_idx" ON "WarehouseOperationalAttachment"("deliveryOrderId");

-- CreateIndex
CREATE INDEX "WarehouseOperationalAttachment_goodsReceiptId_idx" ON "WarehouseOperationalAttachment"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "WarehouseOperationalAttachment_purchaseOrderId_idx" ON "WarehouseOperationalAttachment"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "WarehouseOperationalAttachment_stockOpnameId_idx" ON "WarehouseOperationalAttachment"("stockOpnameId");

-- CreateIndex
CREATE INDEX "WarehouseOperationalAttachment_stockOpnameItemId_idx" ON "WarehouseOperationalAttachment"("stockOpnameItemId");

-- CreateIndex
CREATE INDEX "WarehouseOperationalAttachment_checkpoint_idx" ON "WarehouseOperationalAttachment"("checkpoint");

-- AddForeignKey
ALTER TABLE "WarehouseOperationalAttachment" ADD CONSTRAINT "WarehouseOperationalAttachment_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOperationalAttachment" ADD CONSTRAINT "WarehouseOperationalAttachment_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOperationalAttachment" ADD CONSTRAINT "WarehouseOperationalAttachment_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOperationalAttachment" ADD CONSTRAINT "WarehouseOperationalAttachment_stockOpnameId_fkey" FOREIGN KEY ("stockOpnameId") REFERENCES "StockOpname"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOperationalAttachment" ADD CONSTRAINT "WarehouseOperationalAttachment_stockOpnameItemId_fkey" FOREIGN KEY ("stockOpnameItemId") REFERENCES "StockOpnameItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarehouseOperationalAttachment" ADD CONSTRAINT "WarehouseOperationalAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
