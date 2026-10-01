-- Additive workflow for kiosk-reported material usage.
-- PENDING rows are requests only: they do not change stock, HPP, or MaterialIssue.
-- Warehouse confirmation atomically creates the actual inventory issue.
-- Rollback is safe only before data exists: drop this table, then its enum.
-- After rows exist, keep the additive table to preserve production history.

CREATE TYPE "AdditionalMaterialRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

CREATE TABLE "AdditionalMaterialRequest" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdditionalMaterialRequestStatus" NOT NULL DEFAULT 'PENDING',
    "operatorId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "sourceLocationId" TEXT,
    "materialIssueId" TEXT,
    "stockMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdditionalMaterialRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdditionalMaterialRequest_clientRequestId_key"
    ON "AdditionalMaterialRequest"("clientRequestId");
CREATE UNIQUE INDEX "AdditionalMaterialRequest_materialIssueId_key"
    ON "AdditionalMaterialRequest"("materialIssueId");
CREATE UNIQUE INDEX "AdditionalMaterialRequest_stockMovementId_key"
    ON "AdditionalMaterialRequest"("stockMovementId");
CREATE INDEX "AdditionalMaterialRequest_status_requestedAt_idx"
    ON "AdditionalMaterialRequest"("status", "requestedAt");
CREATE INDEX "AdditionalMaterialRequest_productionOrderId_status_idx"
    ON "AdditionalMaterialRequest"("productionOrderId", "status");
CREATE INDEX "AdditionalMaterialRequest_productVariantId_idx"
    ON "AdditionalMaterialRequest"("productVariantId");

ALTER TABLE "AdditionalMaterialRequest"
    ADD CONSTRAINT "AdditionalMaterialRequest_productionOrderId_fkey"
    FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdditionalMaterialRequest"
    ADD CONSTRAINT "AdditionalMaterialRequest_productVariantId_fkey"
    FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdditionalMaterialRequest"
    ADD CONSTRAINT "AdditionalMaterialRequest_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "Employee"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdditionalMaterialRequest"
    ADD CONSTRAINT "AdditionalMaterialRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdditionalMaterialRequest"
    ADD CONSTRAINT "AdditionalMaterialRequest_sourceLocationId_fkey"
    FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdditionalMaterialRequest"
    ADD CONSTRAINT "AdditionalMaterialRequest_materialIssueId_fkey"
    FOREIGN KEY ("materialIssueId") REFERENCES "MaterialIssue"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdditionalMaterialRequest"
    ADD CONSTRAINT "AdditionalMaterialRequest_stockMovementId_fkey"
    FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
