-- Migration: Add dailyDigest preference and DIGEST_SENT audit action
-- Date: 2026-08-01

ALTER TABLE "TelegramNotificationPreference"
  ADD COLUMN "dailyDigest" BOOLEAN NOT NULL DEFAULT true;

ALTER TYPE "TelegramAuditAction" ADD VALUE 'DIGEST_SENT';
