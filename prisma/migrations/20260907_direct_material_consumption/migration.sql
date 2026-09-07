CREATE TYPE "MaterialConsumptionMode" AS ENUM ('TRANSFER', 'DIRECT');
ALTER TABLE "ProductionOrder" ADD COLUMN "materialConsumptionMode" "MaterialConsumptionMode" NOT NULL DEFAULT 'TRANSFER';
ALTER TABLE "ProductionMaterial" ADD COLUMN "sourceLocationId" TEXT;
CREATE INDEX "ProductionMaterial_sourceLocationId_idx" ON "ProductionMaterial"("sourceLocationId");
ALTER TABLE "ProductionMaterial" ADD CONSTRAINT "ProductionMaterial_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
