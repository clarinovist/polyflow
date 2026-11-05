-- Assistant write proposals (propose -> human confirm). Additive only: one new
-- table, no change to existing tables. Empty on every tenant DB, so safe to apply
-- to all tenants. Not granted to the assistant control role for writes.

-- CreateTable
CREATE TABLE "AssistantActionProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "resultRef" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantActionProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantActionProposal_conversationId_payloadDigest_key" ON "AssistantActionProposal"("conversationId", "payloadDigest");

-- CreateIndex
CREATE INDEX "AssistantActionProposal_tenantId_userId_status_idx" ON "AssistantActionProposal"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "AssistantActionProposal_expiresAt_idx" ON "AssistantActionProposal"("expiresAt");
