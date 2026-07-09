-- CreateTable
CREATE TABLE "TenantAccountRole" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountCode" TEXT,
    "accountName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantAccountRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantAccountRole_tenantId_role_key" ON "TenantAccountRole"("tenantId", "role");

-- CreateIndex
CREATE INDEX "TenantAccountRole_tenantId_idx" ON "TenantAccountRole"("tenantId");

-- AddForeignKey
ALTER TABLE "TenantAccountRole" ADD CONSTRAINT "TenantAccountRole_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
