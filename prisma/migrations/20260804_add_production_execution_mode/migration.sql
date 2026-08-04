-- Migration: Add production execution mode + SPK snapshot
-- Date: 2026-08-04
-- Additive only. Existing processes/orders default to GENERIC.

CREATE TYPE "ProductionExecutionMode" AS ENUM (
  'GENERIC', 'INDIVIDUAL_OUTPUT', 'MATERIAL_CONVERSION'
);

ALTER TABLE "ProductionProcess"
  ADD COLUMN "executionMode" "ProductionExecutionMode" NOT NULL DEFAULT 'GENERIC';

ALTER TABLE "ProductionOrder"
  ADD COLUMN "executionModeSnapshot" "ProductionExecutionMode" DEFAULT 'GENERIC';
