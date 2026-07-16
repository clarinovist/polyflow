-- Dual pay: DAILY vs PIECE (process piece rates + execution snapshots)

BEGIN;

CREATE TYPE "EmployeePayType" AS ENUM ('DAILY', 'PIECE');

ALTER TABLE "Employee" ADD COLUMN "payType" "EmployeePayType" NOT NULL DEFAULT 'DAILY';

CREATE TABLE "ProcessPieceRate" (
    "id" TEXT NOT NULL,
    "machineType" "MachineType" NOT NULL,
    "ratePerKg" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProcessPieceRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProcessPieceRate_machineType_key" ON "ProcessPieceRate"("machineType");

ALTER TABLE "ProductionExecution" ADD COLUMN "pieceRateSnapshot" DECIMAL(12,2);
ALTER TABLE "ProductionExecution" ADD COLUMN "pieceEarnings" DECIMAL(12,2);
ALTER TABLE "ProductionExecution" ADD COLUMN "pieceMachineType" "MachineType";

CREATE INDEX "ProductionExecution_operatorId_startTime_idx" ON "ProductionExecution"("operatorId", "startTime");

COMMIT;
