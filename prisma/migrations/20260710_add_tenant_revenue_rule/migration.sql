-- CreateTable
CREATE TABLE "TenantRevenueRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "matchType" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountCode" TEXT,
    "accountName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRevenueRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantRevenueRule_tenantId_priority_idx" ON "TenantRevenueRule"("tenantId", "priority");

-- AddForeignKey
ALTER TABLE "TenantRevenueRule" ADD CONSTRAINT "TenantRevenueRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
