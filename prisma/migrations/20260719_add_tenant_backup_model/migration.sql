-- CreateTable
CREATE TABLE "TenantBackup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "r2Key" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'custom',
    "triggeredBy" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantBackup_tenantId_createdAt_idx" ON "TenantBackup"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "TenantBackup" ADD CONSTRAINT "TenantBackup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
