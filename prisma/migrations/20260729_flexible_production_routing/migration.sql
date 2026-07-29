-- CreateEnum for flexible routing
CREATE TYPE "ProductionRouteStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "ProductionRunStatus" AS ENUM ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable: ProductionProcess
CREATE TABLE "ProductionProcess" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "requiresMachine" BOOLEAN NOT NULL DEFAULT false,
    "requiresQualityGate" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionProcess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionProcess_code_key" ON "ProductionProcess"("code");
CREATE INDEX "ProductionProcess_isActive_idx" ON "ProductionProcess"("isActive");
CREATE INDEX "ProductionProcess_code_idx" ON "ProductionProcess"("code");

-- CreateTable: MachineProcessCapability
CREATE TABLE "MachineProcessCapability" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MachineProcessCapability_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MachineProcessCapability_machineId_processId_key" ON "MachineProcessCapability"("machineId", "processId");
CREATE INDEX "MachineProcessCapability_processId_idx" ON "MachineProcessCapability"("processId");
CREATE INDEX "MachineProcessCapability_machineId_idx" ON "MachineProcessCapability"("machineId");

-- CreateTable: ProductionRoute
CREATE TABLE "ProductionRoute" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ProductionRouteStatus" NOT NULL DEFAULT 'DRAFT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionRoute_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionRoute_code_key" ON "ProductionRoute"("code");
CREATE UNIQUE INDEX "ProductionRoute_productVariantId_version_key" ON "ProductionRoute"("productVariantId", "version");
CREATE INDEX "ProductionRoute_productVariantId_status_idx" ON "ProductionRoute"("productVariantId", "status");
CREATE INDEX "ProductionRoute_status_idx" ON "ProductionRoute"("status");
CREATE INDEX "ProductionRoute_isDefault_idx" ON "ProductionRoute"("isDefault");

-- CreateTable: ProductionRouteStep
CREATE TABLE "ProductionRouteStep" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stepCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "materialSourceLocationId" TEXT,
    "outputLocationId" TEXT,
    "requiresQualityGate" BOOLEAN NOT NULL DEFAULT false,
    "allowsPartialHandoff" BOOLEAN NOT NULL DEFAULT false,
    "queueTimeMinutes" INTEGER,
    "setupTimeMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionRouteStep_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionRouteStep_routeId_sequence_key" ON "ProductionRouteStep"("routeId", "sequence");
CREATE UNIQUE INDEX "ProductionRouteStep_routeId_stepCode_key" ON "ProductionRouteStep"("routeId", "stepCode");
CREATE INDEX "ProductionRouteStep_routeId_idx" ON "ProductionRouteStep"("routeId");
CREATE INDEX "ProductionRouteStep_processId_idx" ON "ProductionRouteStep"("processId");
CREATE INDEX "ProductionRouteStep_bomId_idx" ON "ProductionRouteStep"("bomId");

-- CreateTable: ProductionRun
CREATE TABLE "ProductionRun" (
    "id" TEXT NOT NULL,
    "runNumber" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "routeVersionSnapshot" INTEGER NOT NULL,
    "routeNameSnapshot" TEXT,
    "productVariantId" TEXT NOT NULL,
    "plannedQuantity" DECIMAL(15,4) NOT NULL,
    "salesOrderId" TEXT,
    "status" "ProductionRunStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "ProductionPriority" NOT NULL DEFAULT 'NORMAL',
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionRun_runNumber_key" ON "ProductionRun"("runNumber");
CREATE INDEX "ProductionRun_routeId_idx" ON "ProductionRun"("routeId");
CREATE INDEX "ProductionRun_productVariantId_idx" ON "ProductionRun"("productVariantId");
CREATE INDEX "ProductionRun_status_idx" ON "ProductionRun"("status");
CREATE INDEX "ProductionRun_plannedStartDate_idx" ON "ProductionRun"("plannedStartDate");

-- AlterTable: ProductionOrder additive columns (nullable for backward compat)
ALTER TABLE "ProductionOrder" ADD COLUMN "productionRunId" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "routeStepId" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "routeSequenceSnapshot" INTEGER;
ALTER TABLE "ProductionOrder" ADD COLUMN "processCodeSnapshot" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "processNameSnapshot" TEXT;
ALTER TABLE "ProductionOrder" ADD COLUMN "materialSourceLocationId" TEXT;
CREATE INDEX "ProductionOrder_productionRunId_idx" ON "ProductionOrder"("productionRunId");
CREATE INDEX "ProductionOrder_routeStepId_idx" ON "ProductionOrder"("routeStepId");

-- AddForeignKey
ALTER TABLE "MachineProcessCapability" ADD CONSTRAINT "MachineProcessCapability_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MachineProcessCapability" ADD CONSTRAINT "MachineProcessCapability_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProductionProcess"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductionRoute" ADD CONSTRAINT "ProductionRoute_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductionRouteStep" ADD CONSTRAINT "ProductionRouteStep_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ProductionRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionRouteStep" ADD CONSTRAINT "ProductionRouteStep_processId_fkey" FOREIGN KEY ("processId") REFERENCES "ProductionProcess"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRouteStep" ADD CONSTRAINT "ProductionRouteStep_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRouteStep" ADD CONSTRAINT "ProductionRouteStep_materialSourceLocationId_fkey" FOREIGN KEY ("materialSourceLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionRouteStep" ADD CONSTRAINT "ProductionRouteStep_outputLocationId_fkey" FOREIGN KEY ("outputLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "ProductionRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_routeStepId_fkey" FOREIGN KEY ("routeStepId") REFERENCES "ProductionRouteStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_materialSourceLocationId_fkey" FOREIGN KEY ("materialSourceLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
