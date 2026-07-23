-- CreateEnum
CREATE TYPE "HelpOutcome" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'BLOCKED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "HelpFeedback" AS ENUM ('UP', 'DOWN');

-- CreateTable
CREATE TABLE "HelpInteraction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "question" TEXT NOT NULL,
    "answerPreview" TEXT NOT NULL,
    "outcome" "HelpOutcome" NOT NULL DEFAULT 'SUCCESS',
    "feedback" "HelpFeedback",
    "confidence" DOUBLE PRECISION,
    "latencyMs" INTEGER NOT NULL,
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpSettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "HelpSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HelpInteraction_tenantId_createdAt_idx" ON "HelpInteraction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "HelpInteraction_outcome_idx" ON "HelpInteraction"("outcome");

-- CreateIndex
CREATE INDEX "HelpInteraction_createdAt_idx" ON "HelpInteraction"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HelpSettings_key_key" ON "HelpSettings"("key");
