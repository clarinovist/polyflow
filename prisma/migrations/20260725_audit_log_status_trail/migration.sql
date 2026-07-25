-- AlterTable: add fromStatus and toStatus columns to AuditLog
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "fromStatus" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "toStatus" TEXT;

-- CreateIndex: composite index for per-entity timeline queries
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex: for chronological sorting
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex: for filtering by action type
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");

-- Seed SYSTEM user for audit fallback (idempotent)
INSERT INTO "User" (id, email, name, password, role, "isActive", "isSuperAdmin", "tokenVersion", locale, "createdAt", "updatedAt")
VALUES (
  'system',
  'system@polyflow.internal',
  'System',
  '$2b$10$0000000000000000000000000000000000000000000000000000', -- unusable hash
  'ADMIN',
  false,
  false,
  0,
  'id',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
