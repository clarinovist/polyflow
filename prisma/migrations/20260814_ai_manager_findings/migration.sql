-- Migration: AI manager Finding lifecycle — Finding + FindingEvent tables,
-- plus a PRODUCTION_STALLED NotificationType value. Fase 1 of the Finding
-- lifecycle (klaim + SLA + eskalasi), scoped to production + warehouse.
-- plan: docs/plan/2026-08-14-ai-manager-l2-finding-lifecycle.md
-- Date: 2026-08-14

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PRODUCTION_STALLED';

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('UNCLAIMED', 'CLAIMED', 'RESOLVED', 'SNOOZED');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "detector" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL,
    "status" "FindingStatus" NOT NULL DEFAULT 'UNCLAIMED',
    "headline" TEXT NOT NULL,
    "detail" TEXT,
    "requiredResources" TEXT[],
    "entityType" TEXT,
    "entityId" TEXT,
    "helpArticleSlug" TEXT,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "autoResolved" BOOLEAN NOT NULL DEFAULT false,
    "slaDueAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FindingEvent" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FindingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Finding_fingerprint_key" ON "Finding"("fingerprint");

-- CreateIndex
CREATE INDEX "Finding_status_idx" ON "Finding"("status");

-- CreateIndex
CREATE INDEX "Finding_status_severity_idx" ON "Finding"("status", "severity");

-- CreateIndex
CREATE INDEX "Finding_status_slaDueAt_idx" ON "Finding"("status", "slaDueAt");

-- CreateIndex
CREATE INDEX "Finding_claimedById_idx" ON "Finding"("claimedById");

-- CreateIndex
CREATE INDEX "FindingEvent_findingId_createdAt_idx" ON "FindingEvent"("findingId", "createdAt");

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FindingEvent" ADD CONSTRAINT "FindingEvent_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
