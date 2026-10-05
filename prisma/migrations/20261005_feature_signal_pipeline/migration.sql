-- Feature request pipeline: signal clusters + proposal review queue.
-- Mirrors the help-learning pattern. Proposals are documents only.
CREATE TYPE "FeatureSignalStatus" AS ENUM ('OPEN', 'CANDIDATE', 'PROPOSED', 'IGNORED');
CREATE TYPE "FeatureProposalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'BUILT', 'SHIPPED');

-- CreateTable FeatureSignalCluster
CREATE TABLE "FeatureSignalCluster" (
    "id" TEXT NOT NULL,
    "canonicalRequest" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "signalKind" TEXT NOT NULL DEFAULT 'explicit_request',
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 1,
    "sampleUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tenantIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedModule" TEXT,
    "sampleRequests" TEXT[],
    "status" "FeatureSignalStatus" NOT NULL DEFAULT 'OPEN',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeatureSignalCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable FeatureProposal
CREATE TABLE "FeatureProposal" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT,
    "title" TEXT NOT NULL,
    "problemMd" TEXT NOT NULL,
    "evidenceMd" TEXT NOT NULL DEFAULT '',
    "impactedModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requesterCount" INTEGER NOT NULL DEFAULT 0,
    "status" "FeatureProposalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "decidedBy" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeatureProposal_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "FeatureSignalCluster_normalizedKey_key" ON "FeatureSignalCluster"("normalizedKey");
CREATE INDEX "FeatureSignalCluster_status_uniqueUsers_idx" ON "FeatureSignalCluster"("status", "uniqueUsers");
CREATE INDEX "FeatureSignalCluster_lastSeenAt_idx" ON "FeatureSignalCluster"("lastSeenAt");
CREATE INDEX "FeatureProposal_status_createdAt_idx" ON "FeatureProposal"("status", "createdAt");
CREATE INDEX "FeatureProposal_clusterId_idx" ON "FeatureProposal"("clusterId");

-- Foreign key
ALTER TABLE "FeatureProposal" ADD CONSTRAINT "FeatureProposal_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "FeatureSignalCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
