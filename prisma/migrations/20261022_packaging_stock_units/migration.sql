-- Existing rows were guarded as whole PCS. Preserve them without reinterpreting
-- any inventory balance, master unit, cost or owner.
BEGIN;
ALTER TABLE "ProductionPackagingConsumption"
  ADD COLUMN "unit" "Unit" NOT NULL DEFAULT 'PCS';
ALTER TABLE "ProductionPackagingConsumption"
  DROP CONSTRAINT "ProductionPackagingConsumption_quantity_check";
ALTER TABLE "ProductionPackagingConsumption"
  ADD CONSTRAINT "ProductionPackagingConsumption_quantity_unit_check"
  CHECK ("quantity" > 0 AND (
    ("unit" = 'PCS' AND "quantity" = trunc("quantity")) OR "unit" = 'KG'
  ));
COMMIT;
