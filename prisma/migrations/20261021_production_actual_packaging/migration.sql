-- Additive only: do not infer ownership or brand for existing stock.
ALTER TABLE "Location" ADD COLUMN "packagingOwnerCustomerId" TEXT;
ALTER TABLE "Location" ADD CONSTRAINT "Location_packagingOwnerCustomerId_fkey"
  FOREIGN KEY ("packagingOwnerCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Location" ADD CONSTRAINT "Location_packaging_owner_type_check"
  CHECK ("packagingOwnerCustomerId" IS NULL OR "locationType" = 'CUSTOMER_OWNED');

ALTER TABLE "ProductionOrder" ADD COLUMN "actualPackagingEnabled" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "requestedOutputVariantId" TEXT;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_requestedOutputVariantId_fkey"
  FOREIGN KEY ("requestedOutputVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionExecution" ADD COLUMN "clientRequestId" TEXT, ADD COLUMN "requestHash" TEXT;
CREATE UNIQUE INDEX "ProductionExecution_clientRequestId_key" ON "ProductionExecution"("clientRequestId");
ALTER TABLE "StockMovement" ADD COLUMN "productionExecutionId" TEXT,
  ADD COLUMN "reversalOfId" TEXT, ADD COLUMN "companyOwned" BOOLEAN,
  ADD COLUMN "packagingOwnerCustomerId" TEXT;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_packagingOwnerCustomerId_fkey"
  FOREIGN KEY ("packagingOwnerCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "StockMovement_reversalOfId_key" ON "StockMovement"("reversalOfId");
CREATE INDEX "StockMovement_productionExecutionId_idx" ON "StockMovement"("productionExecutionId");
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productionExecutionId_fkey"
  FOREIGN KEY ("productionExecutionId") REFERENCES "ProductionExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversalOfId_fkey"
  FOREIGN KEY ("reversalOfId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_not_self_reversal_check" CHECK ("reversalOfId" IS DISTINCT FROM "id");

ALTER TABLE "MaterialIssue" ADD COLUMN "productionExecutionId" TEXT, ADD COLUMN "stagedSourceId" TEXT;
CREATE INDEX "MaterialIssue_productionExecutionId_idx" ON "MaterialIssue"("productionExecutionId");
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_productionExecutionId_fkey"
  FOREIGN KEY ("productionExecutionId") REFERENCES "ProductionExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_stagedSourceId_fkey"
  FOREIGN KEY ("stagedSourceId") REFERENCES "MaterialIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProductionPackagingOption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "baseVariantId" TEXT NOT NULL,
  "outputVariantId" TEXT NOT NULL,
  "labelVariantId" TEXT,
  CONSTRAINT "ProductionPackagingOption_baseVariantId_fkey" FOREIGN KEY ("baseVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionPackagingOption_outputVariantId_fkey" FOREIGN KEY ("outputVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionPackagingOption_labelVariantId_fkey" FOREIGN KEY ("labelVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionPackagingOption_distinct_label_check" CHECK ("labelVariantId" IS NULL OR ("labelVariantId" <> "outputVariantId" AND "labelVariantId" <> "baseVariantId"))
);
CREATE UNIQUE INDEX "ProductionPackagingOption_outputVariantId_key" ON "ProductionPackagingOption"("outputVariantId");
CREATE INDEX "ProductionPackagingOption_baseVariantId_idx" ON "ProductionPackagingOption"("baseVariantId");

CREATE TABLE "ProductionOutputGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "executionId" TEXT NOT NULL,
  "position" INTEGER NOT NULL CHECK ("position" BETWEEN 0 AND 1),
  "productVariantId" TEXT NOT NULL,
  "quantity" DECIMAL(15,4) NOT NULL CHECK ("quantity" > 0),
  "unitCost" DECIMAL(15,4) NOT NULL CHECK ("unitCost" >= 0),
  "movementId" TEXT NOT NULL,
  CONSTRAINT "ProductionOutputGroup_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ProductionExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionOutputGroup_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionOutputGroup_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductionOutputGroup_movementId_key" ON "ProductionOutputGroup"("movementId");
CREATE UNIQUE INDEX "ProductionOutputGroup_executionId_position_key" ON "ProductionOutputGroup"("executionId", "position");

CREATE TABLE "ProductionPackagingConsumption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "executionId" TEXT NOT NULL,
  "outputGroupId" TEXT NOT NULL,
  "productVariantId" TEXT NOT NULL,
  "quantity" DECIMAL(15,4) NOT NULL CHECK ("quantity" > 0 AND "quantity" = trunc("quantity")),
  "movementId" TEXT NOT NULL,
  CONSTRAINT "ProductionPackagingConsumption_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "ProductionExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionPackagingConsumption_outputGroupId_fkey" FOREIGN KEY ("outputGroupId") REFERENCES "ProductionOutputGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionPackagingConsumption_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProductionPackagingConsumption_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductionPackagingConsumption_movementId_key" ON "ProductionPackagingConsumption"("movementId");
CREATE INDEX "ProductionPackagingConsumption_executionId_idx" ON "ProductionPackagingConsumption"("executionId");

-- Dedicated custody locations cannot be laundered through legacy movement paths.
CREATE FUNCTION guard_packaging_custody_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_owner TEXT; target_owner TEXT;
BEGIN
  IF NEW."productionOrderId" IS NOT NULL AND NEW.type = 'OUT' AND NEW."productionExecutionId" IS NULL
     AND EXISTS (SELECT 1 FROM "ProductionOrder" WHERE id = NEW."productionOrderId" AND "actualPackagingEnabled") THEN
    RAISE EXCEPTION 'Actual packaging order requires execution-linked consumption';
  END IF;
  SELECT "packagingOwnerCustomerId" INTO source_owner FROM "Location" WHERE id = NEW."fromLocationId";
  SELECT "packagingOwnerCustomerId" INTO target_owner FROM "Location" WHERE id = NEW."toLocationId";
  IF source_owner IS NOT NULL OR target_owner IS NOT NULL THEN
    IF NEW.type = 'TRANSFER' AND source_owner IS DISTINCT FROM target_owner THEN
      RAISE EXCEPTION 'Packaging custody transfer cannot change owner';
    END IF;
    IF NEW."packagingOwnerCustomerId" IS DISTINCT FROM COALESCE(source_owner, target_owner)
       OR NEW."companyOwned" IS DISTINCT FROM FALSE OR NEW.cost IS DISTINCT FROM 0::numeric THEN
      RAISE EXCEPTION 'Packaging custody movement requires verified owner and zero value';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "StockMovement_packaging_custody_guard" BEFORE INSERT OR UPDATE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION guard_packaging_custody_movement();

CREATE FUNCTION guard_packaging_location_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."packagingOwnerCustomerId" IS NOT NULL AND
     (NEW."packagingOwnerCustomerId" IS DISTINCT FROM OLD."packagingOwnerCustomerId" OR NEW."locationType" <> 'CUSTOMER_OWNED') THEN
    RAISE EXCEPTION 'Packaging custody owner is immutable';
  END IF;
  IF OLD."packagingOwnerCustomerId" IS NULL AND NEW."packagingOwnerCustomerId" IS NOT NULL AND
     (EXISTS (SELECT 1 FROM "StockMovement" WHERE "fromLocationId" = OLD.id OR "toLocationId" = OLD.id)
      OR EXISTS (SELECT 1 FROM "Inventory" WHERE "locationId" = OLD.id)) THEN
    RAISE EXCEPTION 'Historical stock cannot be assigned an inferred packaging owner';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Location_packaging_identity_guard" BEFORE UPDATE ON "Location"
  FOR EACH ROW EXECUTE FUNCTION guard_packaging_location_identity();
