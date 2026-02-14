-- CreateTable
CREATE TABLE "CostHistory" (
    "id" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "previousCost" DECIMAL(15,4),
    "newCost" DECIMAL(15,4) NOT NULL,
    "changeReason" TEXT NOT NULL,
    "referenceId" TEXT,
    "changePercent" DECIMAL(10,2),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CostHistory_productVariantId_createdAt_idx" ON "CostHistory"("productVariantId", "createdAt");

-- AddForeignKey
ALTER TABLE "CostHistory" ADD CONSTRAINT "CostHistory_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostHistory" ADD CONSTRAINT "CostHistory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
