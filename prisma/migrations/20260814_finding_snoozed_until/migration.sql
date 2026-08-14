-- Migration: Finding.snoozedUntil — lets a snoozed finding wake itself back
-- up (checked by finding-sync.ts on the next detection cycle) instead of
-- staying hidden indefinitely. Fase 4 of the Finding lifecycle UI.
-- plan: docs/plan/2026-08-14-ai-manager-l2-finding-lifecycle.md
-- Date: 2026-08-14

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN "snoozedUntil" TIMESTAMP(3);
