-- Material Order generik tenant-wide (pilot HD). Additive only.
-- PENDING/DRAFT tidak menyentuh stok. APPROVED boleh diterbitkan ke MaterialIssue oleh gudang.
-- Rollback aman sebelum ada data: drop tabel + enum.

CREATE TYPE "MaterialOrderStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "MaterialOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderType" TEXT NOT NULL DEFAULT 'HD',
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bomId" TEXT,
    "outputVariantId" TEXT,
    "plannedQuantity" DECIMAL(15,4),
    "status" "MaterialOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "materialIssueId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaterialOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaterialOrderItem" (
    "id" TEXT NOT NULL,
    "materialOrderId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "zakQuantity" DECIMAL(15,4),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaterialOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaterialOrder_orderNumber_key" ON "MaterialOrder"("orderNumber");
CREATE UNIQUE INDEX "MaterialOrder_clientRequestId_key" ON "MaterialOrder"("clientRequestId");
CREATE UNIQUE INDEX "MaterialOrder_materialIssueId_key" ON "MaterialOrder"("materialIssueId");
CREATE INDEX "MaterialOrder_status_orderDate_idx" ON "MaterialOrder"("status", "orderDate");
CREATE INDEX "MaterialOrder_orderType_status_idx" ON "MaterialOrder"("orderType", "status");
CREATE INDEX "MaterialOrderItem_materialOrderId_idx" ON "MaterialOrderItem"("materialOrderId");
CREATE INDEX "MaterialOrderItem_productVariantId_idx" ON "MaterialOrderItem"("productVariantId");

ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialOrder" ADD CONSTRAINT "MaterialOrder_outputVariantId_fkey" FOREIGN KEY ("outputVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialOrderItem" ADD CONSTRAINT "MaterialOrderItem_materialOrderId_fkey" FOREIGN KEY ("materialOrderId") REFERENCES "MaterialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialOrderItem" ADD CONSTRAINT "MaterialOrderItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
