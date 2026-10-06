-- Maintenance generik (lapor -> approve -> kerjakan -> selesai). Additive only.
-- DRAFT/PENDING tidak menyentuh stok/jurnal. Spare part hanya catatan kebutuhan.
-- Approve dgn mesin berhenti membuka MachineDowntime; DONE menutupnya.

CREATE TYPE "MaintenanceStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'DONE', 'CANCELLED');
CREATE TYPE "MaintenanceUrgency" AS ENUM ('LOW', 'NORMAL', 'URGENT');

CREATE TABLE "MaintenanceRequest" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "complaint" TEXT NOT NULL,
    "urgency" "MaintenanceUrgency" NOT NULL DEFAULT 'NORMAL',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "assigneeName" TEXT,
    "machineStopped" BOOLEAN NOT NULL DEFAULT false,
    "downtimeId" TEXT,
    "completionNote" TEXT,
    "completedAt" TIMESTAMP(3),
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MaintenanceRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MaintenanceSparePartNeed" (
    "id" TEXT NOT NULL,
    "maintenanceRequestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "quantity" DECIMAL(15,4) NOT NULL,
    "note" TEXT,
    "fulfilled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MaintenanceSparePartNeed_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaintenanceRequest_orderNumber_key" ON "MaintenanceRequest"("orderNumber");
CREATE UNIQUE INDEX "MaintenanceRequest_clientRequestId_key" ON "MaintenanceRequest"("clientRequestId");
CREATE UNIQUE INDEX "MaintenanceRequest_downtimeId_key" ON "MaintenanceRequest"("downtimeId");
CREATE INDEX "MaintenanceRequest_status_createdAt_idx" ON "MaintenanceRequest"("status", "createdAt");
CREATE INDEX "MaintenanceRequest_machineId_status_idx" ON "MaintenanceRequest"("machineId", "status");
CREATE INDEX "MaintenanceSparePartNeed_requestId_idx" ON "MaintenanceSparePartNeed"("maintenanceRequestId");

ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON UPDATE CASCADE;
ALTER TABLE "MaintenanceSparePartNeed" ADD CONSTRAINT "MaintenanceSparePartNeed_requestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "MaintenanceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
