-- AlterTable: Add isActive column to Bom (default true = all existing BOMs stay active)
ALTER TABLE "Bom" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Bom_isActive_idx" ON "Bom"("isActive");

-- CreateIndex
CREATE INDEX "Bom_productVariantId_isActive_isDefault_idx" ON "Bom"("productVariantId", "isActive", "isDefault");
