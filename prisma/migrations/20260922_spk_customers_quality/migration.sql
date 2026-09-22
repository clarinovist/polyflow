-- Additive, tenant-independent metadata. Existing QC requirements are preserved.
ALTER TABLE "QualityCheckParameter"
ADD COLUMN "requireMeasurement" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "ProductionOrderCustomer" (
    "productionOrderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    CONSTRAINT "ProductionOrderCustomer_pkey" PRIMARY KEY ("productionOrderId", "customerId"),
    CONSTRAINT "ProductionOrderCustomer_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductionOrderCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProductionOrderCustomer_customerId_idx" ON "ProductionOrderCustomer"("customerId");
