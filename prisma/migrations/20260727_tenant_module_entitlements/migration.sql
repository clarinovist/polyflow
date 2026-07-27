-- CreateEnum
CREATE TYPE "TenantModuleStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED');

-- CreateTable
CREATE TABLE "TenantModule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "status" "TenantModuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantModule_tenantId_moduleKey_idx" ON "TenantModule"("tenantId", "moduleKey");

-- CreateIndex
CREATE INDEX "TenantModule_tenantId_status_idx" ON "TenantModule"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "TenantModule" ADD CONSTRAINT "TenantModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: give ALL modules to existing tenants so no one loses access.
-- Run this as a SEPARATE statement after the table is created.
-- The list must match ALL_MODULE_KEYS from module-registry.ts minus CORE.
-- CORE is always-active and does not need a TenantModule row.
INSERT INTO "TenantModule" ("id", "tenantId", "moduleKey", "status", "enabledAt", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  t."id",
  m.moduleKey,
  'ACTIVE',
  NOW(),
  NOW(),
  NOW()
FROM "Tenant" t
CROSS JOIN (
  VALUES
    ('HRD'),
    ('SALES'),
    ('PURCHASING'),
    ('PRODUCTION'),
    ('INVENTORY'),
    ('FINANCE'),
    ('MAKLON')
) AS m(moduleKey)
ON CONFLICT ("tenantId", "moduleKey") DO NOTHING;
