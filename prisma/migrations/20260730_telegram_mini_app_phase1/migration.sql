-- Telegram Mini App Phase 1 — Shell + Session + Identity + Notification Foundation

-- CreateEnum TelegramIdentityStatus (if not exists, create)
DO $$ BEGIN
  CREATE TYPE "TelegramIdentityStatus" AS ENUM ('ACTIVE', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "TelegramNotificationStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED_DUP', 'SKIPPED_QUIET', 'SPAM_BLOCKED', 'SKIPPED_KILL_SWITCH');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "TelegramAuditAction" AS ENUM ('WEBHOOK_RECEIVE', 'WEBHOOK_DUP', 'WEBHOOK_AUTH_FAILED', 'SESSION_CREATE', 'SESSION_VERIFY', 'SESSION_EXPIRED', 'SESSION_INVALID', 'BOOTSTRAP', 'HOME_FETCH', 'LINK_START', 'LINK_SUCCESS', 'LINK_FAILED', 'UNLINK', 'NOTIF_SEND', 'NOTIF_SKIPPED', 'KILL_SWITCH_BLOCKED', 'ADMIN_BLOCKED', 'ALLOWLIST_BLOCKED', 'TENANT_MISMATCH');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable TelegramIdentity
CREATE TABLE IF NOT EXISTS "TelegramIdentity" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "telegramUsername" TEXT,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TelegramIdentityStatus" NOT NULL DEFAULT 'ACTIVE',
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable TelegramLinkToken
CREATE TABLE IF NOT EXISTS "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable TelegramUpdateLog
CREATE TABLE IF NOT EXISTS "TelegramUpdateLog" (
    "id" TEXT NOT NULL,
    "updateId" TEXT NOT NULL,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable TelegramNotificationPreference
CREATE TABLE IF NOT EXISTS "TelegramNotificationPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "criticalStock" BOOLEAN NOT NULL DEFAULT true,
    "quietHoursStart" INTEGER,
    "quietHoursEnd" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable TelegramNotificationLog
CREATE TABLE IF NOT EXISTS "TelegramNotificationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "telegramChatId" TEXT,
    "dedupKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT,
    "status" "TelegramNotificationStatus" NOT NULL DEFAULT 'SENT',
    "telegramMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable TelegramMiniAppSession
CREATE TABLE IF NOT EXISTS "TelegramMiniAppSession" (
    "id" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "telegramIdentityId" TEXT,
    "telegramUserId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramMiniAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable TelegramAuditLog
CREATE TABLE IF NOT EXISTS "TelegramAuditLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "TelegramAuditAction" NOT NULL,
    "telegramUserIdHash" TEXT,
    "userId" TEXT,
    "tenantId" TEXT,
    "resource" TEXT,
    "outcome" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "ip" TEXT,
    "userAgent" TEXT,
    "details" JSONB,

    CONSTRAINT "TelegramAuditLog_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramIdentity_telegramUserId_tenantId_key" ON "TelegramIdentity"("telegramUserId", "tenantId");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramLinkToken_token_key" ON "TelegramLinkToken"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramUpdateLog_updateId_key" ON "TelegramUpdateLog"("updateId");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramNotificationPreference_tenantId_userId_key" ON "TelegramNotificationPreference"("tenantId", "userId");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramNotificationLog_dedupKey_key" ON "TelegramNotificationLog"("dedupKey");
CREATE UNIQUE INDEX IF NOT EXISTS "TelegramMiniAppSession_sessionTokenHash_key" ON "TelegramMiniAppSession"("sessionTokenHash");

-- Indexes TelegramIdentity
CREATE INDEX IF NOT EXISTS "TelegramIdentity_tenantId_userId_idx" ON "TelegramIdentity"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "TelegramIdentity_telegramUserId_idx" ON "TelegramIdentity"("telegramUserId");
CREATE INDEX IF NOT EXISTS "TelegramIdentity_status_idx" ON "TelegramIdentity"("status");

-- Indexes TelegramLinkToken
CREATE INDEX IF NOT EXISTS "TelegramLinkToken_tenantId_userId_idx" ON "TelegramLinkToken"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "TelegramLinkToken_expiresAt_idx" ON "TelegramLinkToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "TelegramLinkToken_token_idx" ON "TelegramLinkToken"("token");

-- Indexes TelegramUpdateLog
CREATE INDEX IF NOT EXISTS "TelegramUpdateLog_createdAt_idx" ON "TelegramUpdateLog"("createdAt");

-- Indexes TelegramNotificationPreference
CREATE INDEX IF NOT EXISTS "TelegramNotificationPreference_tenantId_idx" ON "TelegramNotificationPreference"("tenantId");

-- Indexes TelegramNotificationLog
CREATE INDEX IF NOT EXISTS "TelegramNotificationLog_tenantId_userId_idx" ON "TelegramNotificationLog"("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "TelegramNotificationLog_type_createdAt_idx" ON "TelegramNotificationLog"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "TelegramNotificationLog_dedupKey_idx" ON "TelegramNotificationLog"("dedupKey");

-- Indexes TelegramMiniAppSession
CREATE INDEX IF NOT EXISTS "TelegramMiniAppSession_telegramUserId_idx" ON "TelegramMiniAppSession"("telegramUserId");
CREATE INDEX IF NOT EXISTS "TelegramMiniAppSession_userId_idx" ON "TelegramMiniAppSession"("userId");
CREATE INDEX IF NOT EXISTS "TelegramMiniAppSession_tenantId_idx" ON "TelegramMiniAppSession"("tenantId");
CREATE INDEX IF NOT EXISTS "TelegramMiniAppSession_expiresAt_idx" ON "TelegramMiniAppSession"("expiresAt");

-- Indexes TelegramAuditLog
CREATE INDEX IF NOT EXISTS "TelegramAuditLog_tenantId_createdAt_idx" ON "TelegramAuditLog"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "TelegramAuditLog_action_createdAt_idx" ON "TelegramAuditLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "TelegramAuditLog_userId_idx" ON "TelegramAuditLog"("userId");
