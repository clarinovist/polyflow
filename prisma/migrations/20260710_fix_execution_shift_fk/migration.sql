-- Drop existing FK from ProductionExecution.shiftId -> WorkShift
ALTER TABLE "ProductionExecution" DROP CONSTRAINT IF EXISTS "ProductionExecution_shiftId_fkey";

-- Clear any existing shiftId values (they reference WorkShift, which is wrong)
UPDATE "ProductionExecution" SET "shiftId" = NULL WHERE "shiftId" IS NOT NULL;

-- Add new FK from ProductionExecution.shiftId -> ProductionShift
ALTER TABLE "ProductionExecution"
  ADD CONSTRAINT "ProductionExecution_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "ProductionShift"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: match executions to ProductionShift by time range + operator
UPDATE "ProductionExecution" pe
SET "shiftId" = ps.id
FROM "ProductionShift" ps
WHERE pe."productionOrderId" = ps."productionOrderId"
  AND pe."shiftId" IS NULL
  AND pe."startTime" >= ps."startTime"
  AND pe."startTime" <= ps."endTime"
  AND (ps."operatorId" IS NULL OR ps."operatorId" = pe."operatorId");
