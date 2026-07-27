-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'FEATURE_VIEW',
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "sessionId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_occurredAt_idx" ON "UsageEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_featureKey_occurredAt_idx" ON "UsageEvent"("featureKey", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_moduleKey_occurredAt_idx" ON "UsageEvent"("moduleKey", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_tenantId_occurredAt_idx" ON "UsageEvent"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_tenantId_moduleKey_occurredAt_idx" ON "UsageEvent"("tenantId", "moduleKey", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_occurredAt_idx" ON "UsageEvent"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_tenantId_featureKey_occurredAt_idx" ON "UsageEvent"("tenantId", "featureKey", "occurredAt");
