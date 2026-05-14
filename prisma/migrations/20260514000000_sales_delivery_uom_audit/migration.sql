-- UOM audit snapshots for production planning, sales documents, and deliveries
-- Canonical quantities remain in base/primary units; entered fields preserve user/customer-facing unit input.

ALTER TABLE "ProductionOrder"
ADD COLUMN "plannedEnteredQuantity" DECIMAL(15,4),
ADD COLUMN "plannedEnteredUnit" "Unit",
ADD COLUMN "plannedConversionFactorSnapshot" DECIMAL(10,4);

ALTER TABLE "SalesQuotationItem"
ADD COLUMN "enteredQuantity" DECIMAL(15,4),
ADD COLUMN "enteredUnit" "Unit",
ADD COLUMN "conversionFactorSnapshot" DECIMAL(10,4),
ADD COLUMN "enteredUnitPrice" DECIMAL(15,2);

ALTER TABLE "SalesOrderItem"
ADD COLUMN "enteredQuantity" DECIMAL(15,4),
ADD COLUMN "enteredUnit" "Unit",
ADD COLUMN "conversionFactorSnapshot" DECIMAL(10,4),
ADD COLUMN "enteredUnitPrice" DECIMAL(15,2);

ALTER TABLE "DeliveryOrderItem"
ADD COLUMN "enteredQuantity" DECIMAL(15,4),
ADD COLUMN "enteredUnit" "Unit",
ADD COLUMN "conversionFactorSnapshot" DECIMAL(10,4);
