-- ProductionExecution UOM audit trail
-- Adds fields to preserve operator-entered unit vs base unit
-- All new fields nullable so existing rows stay valid

ALTER TABLE "ProductionExecution" 
ADD COLUMN "enteredQuantity" DECIMAL(15,4),
ADD COLUMN "enteredUnit" "Unit",
ADD COLUMN "conversionFactorSnapshot" DECIMAL(10,4);
