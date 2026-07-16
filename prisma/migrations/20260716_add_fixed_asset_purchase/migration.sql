-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'FIXED_ASSET';

-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('MACHINERY', 'VEHICLE', 'BUILDING', 'EQUIPMENT', 'OTHER');

-- AlterTable: Product
ALTER TABLE "Product" ADD COLUMN "assetCategory" "AssetCategory";

-- AlterTable: FixedAsset
ALTER TABLE "FixedAsset" ADD COLUMN "productVariantId" TEXT,
                          ADD COLUMN "purchaseOrderId" TEXT,
                          ADD COLUMN "goodsReceiptId" TEXT,
                          ADD COLUMN "purchaseOrderItemId" TEXT;

-- CreateIndex (if not exists for new FK columns)
CREATE INDEX IF NOT EXISTS "FixedAsset_productVariantId_idx" ON "FixedAsset"("productVariantId");
CREATE INDEX IF NOT EXISTS "FixedAsset_purchaseOrderId_idx" ON "FixedAsset"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "FixedAsset_goodsReceiptId_idx" ON "FixedAsset"("goodsReceiptId");
