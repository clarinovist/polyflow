-- CENTRAL-only Telegram assistant V1 (MAIN/control DB authority).
-- Additive and rollback-safe: legacy TelegramIdentity/TelegramLinkToken and
-- notification credentials remain untouched. Raw link tokens and Telegram
-- updates are intentionally not persisted.

CREATE TYPE "TelegramAssistantLinkStatus" AS ENUM ('ACTIVE', 'REVOKED');
CREATE TYPE "TelegramAssistantLinkTokenStatus" AS ENUM ('PENDING', 'CONSUMED', 'REVOKED');
CREATE TYPE "TelegramAssistantUpdateStatus" AS ENUM ('RESERVED', 'PROCESSING', 'WAITING', 'DONE', 'FAILED', 'IGNORED');
CREATE TYPE "TelegramAssistantAuditAction" AS ENUM (
    'LINK_TOKEN_CREATED',
    'LINK_TOKEN_CONSUMED',
    'LINK_TOKEN_REJECTED',
    'LINK_ACTIVATED',
    'WORKSPACES_LISTED',
    'TENANT_SELECTED',
    'TENANT_SELECTION_REJECTED',
    'LINK_REVOKED',
    'WEBHOOK_RESERVED',
    'WEBHOOK_DUPLICATE',
    'WEBHOOK_REJECTED',
    'KILL_SWITCH_ACK',
    'ASSISTANT_SUBMITTED',
    'DELIVERY_SENT',
    'DELIVERY_FAILED',
    'AUTHORITY_DENIED'
);

CREATE TABLE "TelegramAssistantLink" (
    "id" TEXT NOT NULL,
    "botKey" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramChatId" TEXT NOT NULL,
    "globalAccountId" TEXT NOT NULL,
    "status" "TelegramAssistantLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "selectedTenantId" TEXT,
    "selectedMembershipId" TEXT,
    "selectedTenantUserId" TEXT,
    "activeConversationId" TEXT,
    "selectionVersion" INTEGER NOT NULL DEFAULT 0,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAssistantLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAssistantLinkToken" (
    "id" TEXT NOT NULL,
    "tokenDigest" TEXT NOT NULL,
    "globalAccountId" TEXT NOT NULL,
    "status" "TelegramAssistantLinkTokenStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAssistantLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAssistantAuditLog" (
    "id" TEXT NOT NULL,
    "action" "TelegramAssistantAuditAction" NOT NULL,
    "outcome" TEXT NOT NULL,
    "botKey" TEXT,
    "telegramUserIdHash" TEXT,
    "globalAccountId" TEXT,
    "tenantId" TEXT,
    "membershipId" TEXT,
    "updateIdHash" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramAssistantAuditLog_pkey" PRIMARY KEY ("id")
);

-- Upgrade the historical ingress log compatibly. Existing rows become
-- (legacy, updateId); requestId is populated from the existing UUID id so the
-- migration requires neither random functions nor raw update backfill.
ALTER TABLE "TelegramUpdateLog"
    DROP CONSTRAINT IF EXISTS "TelegramUpdateLog_updateId_key";
ALTER TABLE "TelegramUpdateLog"
    ADD COLUMN "botKey" TEXT NOT NULL DEFAULT 'legacy',
    ADD COLUMN "status" "TelegramAssistantUpdateStatus" NOT NULL DEFAULT 'RESERVED',
    ADD COLUMN "telegramUserId" TEXT,
    ADD COLUMN "telegramChatId" TEXT,
    ADD COLUMN "callbackQueryId" TEXT,
    ADD COLUMN "callbackMembershipId" TEXT,
    ADD COLUMN "callbackSelectionVersion" INTEGER,
    ADD COLUMN "sourceMessageId" TEXT,
    ADD COLUMN "requestId" TEXT DEFAULT (gen_random_uuid()::text),
    ADD COLUMN "question" TEXT,
    ADD COLUMN "responseText" TEXT,
    ADD COLUMN "replyMarkup" JSONB,
    ADD COLUMN "placeholderMessageId" TEXT,
    ADD COLUMN "assistantConversationId" TEXT,
    ADD COLUMN "authorityLinkId" TEXT,
    ADD COLUMN "authorityGlobalAccountId" TEXT,
    ADD COLUMN "authorityMembershipId" TEXT,
    ADD COLUMN "authorityTenantId" TEXT,
    ADD COLUMN "authorityTenantUserId" TEXT,
    ADD COLUMN "authoritySelectionVersion" INTEGER,
    ADD COLUMN "authorityGlobalRevocationVersion" INTEGER,
    ADD COLUMN "authorityMembershipVersion" INTEGER,
    ADD COLUMN "authorityCentralAuthVersion" INTEGER,
    ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "leaseUntil" TIMESTAMP(3),
    ADD COLUMN "claimToken" TEXT,
    ADD COLUMN "lastErrorCode" TEXT,
    ADD COLUMN "processedAt" TIMESTAMP(3),
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "TelegramUpdateLog" SET "requestId" = "id" WHERE "requestId" IS NULL;
ALTER TABLE "TelegramUpdateLog" ALTER COLUMN "requestId" SET NOT NULL;

CREATE UNIQUE INDEX "TelegramAssistantLink_globalAccountId_key"
    ON "TelegramAssistantLink"("globalAccountId");
CREATE UNIQUE INDEX "TelegramAssistantLink_botKey_telegramUserId_key"
    ON "TelegramAssistantLink"("botKey", "telegramUserId");
CREATE INDEX "TelegramAssistantLink_status_idx"
    ON "TelegramAssistantLink"("status");
CREATE INDEX "TelegramAssistantLink_selectedTenantId_selectedMembershipId_idx"
    ON "TelegramAssistantLink"("selectedTenantId", "selectedMembershipId");

CREATE UNIQUE INDEX "TelegramAssistantLinkToken_tokenDigest_key"
    ON "TelegramAssistantLinkToken"("tokenDigest");
CREATE INDEX "TelegramAssistantLinkToken_globalAccountId_status_expiresAt_idx"
    ON "TelegramAssistantLinkToken"("globalAccountId", "status", "expiresAt");
CREATE INDEX "TelegramAssistantLinkToken_expiresAt_idx"
    ON "TelegramAssistantLinkToken"("expiresAt");

CREATE INDEX "TelegramAssistantAuditLog_action_createdAt_idx"
    ON "TelegramAssistantAuditLog"("action", "createdAt");
CREATE INDEX "TelegramAssistantAuditLog_globalAccountId_createdAt_idx"
    ON "TelegramAssistantAuditLog"("globalAccountId", "createdAt");
CREATE INDEX "TelegramAssistantAuditLog_tenantId_createdAt_idx"
    ON "TelegramAssistantAuditLog"("tenantId", "createdAt");

CREATE UNIQUE INDEX "TelegramUpdateLog_botKey_updateId_key"
    ON "TelegramUpdateLog"("botKey", "updateId");
CREATE UNIQUE INDEX "TelegramUpdateLog_requestId_key"
    ON "TelegramUpdateLog"("requestId");
CREATE INDEX "TelegramUpdateLog_status_availableAt_idx"
    ON "TelegramUpdateLog"("status", "availableAt");

ALTER TABLE "TelegramAssistantLink"
    ADD CONSTRAINT "TelegramAssistantLink_globalAccountId_fkey"
    FOREIGN KEY ("globalAccountId") REFERENCES "GlobalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelegramAssistantLinkToken"
    ADD CONSTRAINT "TelegramAssistantLinkToken_globalAccountId_fkey"
    FOREIGN KEY ("globalAccountId") REFERENCES "GlobalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
