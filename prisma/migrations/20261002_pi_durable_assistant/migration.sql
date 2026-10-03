-- Additive durable-assistant binding and idempotency fields.
-- Nullable columns keep the legacy engine backward-compatible during rollback.
-- Crash-safe reservation: AssistantDurableSubmission reserves one row per
-- (tenant,user,channel,requestId) BEFORE SQLite admission, so a hard crash
-- between admission and registration cannot orphan a duplicate run. Nullable
-- durable IDs + pending status mark the reservation window; admission fills
-- them in. The FK to the binding is DEFERRABLE so the reservation can commit
-- in the same transaction cycle before the binding row exists.

ALTER TABLE "HelpConversation"
    ADD COLUMN "assistantRuntime" TEXT,
    ADD COLUMN "accessScopeHash" TEXT,
    ADD COLUMN "workContextKey" TEXT,
    ADD COLUMN "durableVersion" INTEGER;

ALTER TABLE "HelpMessage"
    ADD COLUMN "requestId" TEXT,
    ADD COLUMN "durableEntryId" TEXT;

ALTER TABLE "HelpToolExecution"
    ADD COLUMN "executionKey" TEXT,
    ADD COLUMN "durableTaskId" TEXT,
    ADD COLUMN "durableCallId" TEXT,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "HelpInteraction"
    ADD COLUMN "requestId" TEXT;

ALTER TABLE "AuditLog"
    ADD COLUMN "dedupeKey" TEXT;

CREATE TABLE "AssistantDurableBinding" (
    "id" TEXT NOT NULL,
    "publicConversationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "accessScopeHash" TEXT NOT NULL,
    "workContextKey" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "durableConversationId" TEXT NOT NULL,
    "storageVersion" INTEGER NOT NULL DEFAULT 1,
    "pathname" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantDurableBinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AssistantDurableSubmission" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "questionHash" TEXT NOT NULL,
    "publicConversationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "durableSubmissionId" TEXT,
    "durableConversationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssistantDurableSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuditLog_dedupeKey_key"
    ON "AuditLog"("dedupeKey");
CREATE UNIQUE INDEX "HelpInteraction_tenantId_userId_channel_requestId_key"
    ON "HelpInteraction"("tenantId", "userId", "channel", "requestId");
CREATE UNIQUE INDEX "HelpMessage_conversationId_requestId_role_key"
    ON "HelpMessage"("conversationId", "requestId", "role");
CREATE UNIQUE INDEX "HelpMessage_conversationId_durableEntryId_key"
    ON "HelpMessage"("conversationId", "durableEntryId");
CREATE UNIQUE INDEX "HelpToolExecution_conversationId_executionKey_key"
    ON "HelpToolExecution"("conversationId", "executionKey");
CREATE INDEX "HelpConversation_tenantId_userId_channel_accessScopeHash_workContextKey_idx"
    ON "HelpConversation"("tenantId", "userId", "channel", "accessScopeHash", "workContextKey");
CREATE UNIQUE INDEX "AssistantDurableBinding_publicConversationId_key"
    ON "AssistantDurableBinding"("publicConversationId");
CREATE UNIQUE INDEX "AssistantDurableBinding_tenantId_userId_channel_accessScopeHash_workContextKey_publicConversationId_key"
    ON "AssistantDurableBinding"("tenantId", "userId", "channel", "accessScopeHash", "workContextKey", "publicConversationId");
CREATE INDEX "AssistantDurableBinding_tenantId_userId_channel_idx"
    ON "AssistantDurableBinding"("tenantId", "userId", "channel");
CREATE INDEX "AssistantDurableBinding_storageKey_idx"
    ON "AssistantDurableBinding"("storageKey");
CREATE UNIQUE INDEX "AssistantDurableSubmission_tenantId_userId_channel_requestId_key"
    ON "AssistantDurableSubmission"("tenantId", "userId", "channel", "requestId");
CREATE INDEX "AssistantDurableSubmission_publicConversationId_status_idx"
    ON "AssistantDurableSubmission"("publicConversationId", "status");

ALTER TABLE "AssistantDurableBinding"
    ADD CONSTRAINT "AssistantDurableBinding_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssistantDurableSubmission"
    ADD CONSTRAINT "AssistantDurableSubmission_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssistantDurableSubmission"
    ADD CONSTRAINT "AssistantDurableSubmission_publicConversationId_fkey"
    FOREIGN KEY ("publicConversationId") REFERENCES "AssistantDurableBinding"("publicConversationId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;
