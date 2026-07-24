-- CreateEnum
CREATE TYPE "HelpClusterStatus" AS ENUM ('OPEN', 'DRAFTED', 'RESOLVED', 'IGNORED');
CREATE TYPE "HelpLearningStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateTable HelpQuestionCluster
CREATE TABLE "HelpQuestionCluster" (
    "id" TEXT NOT NULL,
    "canonicalQuestion" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "suggestedModule" TEXT,
    "sampleQuestions" TEXT[],
    "status" "HelpClusterStatus" NOT NULL DEFAULT 'OPEN',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HelpQuestionCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable HelpLearningDraft
CREATE TABLE "HelpLearningDraft" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT,
    "articleId" TEXT,
    "draftTitle" TEXT NOT NULL,
    "draftBodyMd" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "HelpLearningStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "sourceSampleCount" INTEGER NOT NULL DEFAULT 0,
    "modelMeta" TEXT,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HelpLearningDraft_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "HelpQuestionCluster_normalizedKey_key" ON "HelpQuestionCluster"("normalizedKey");
CREATE INDEX "HelpQuestionCluster_status_hitCount_idx" ON "HelpQuestionCluster"("status", "hitCount");
CREATE INDEX "HelpQuestionCluster_lastSeenAt_idx" ON "HelpQuestionCluster"("lastSeenAt");
CREATE INDEX "HelpLearningDraft_status_createdAt_idx" ON "HelpLearningDraft"("status", "createdAt");
CREATE INDEX "HelpLearningDraft_clusterId_idx" ON "HelpLearningDraft"("clusterId");

-- Foreign key
ALTER TABLE "HelpLearningDraft" ADD CONSTRAINT "HelpLearningDraft_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "HelpQuestionCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
