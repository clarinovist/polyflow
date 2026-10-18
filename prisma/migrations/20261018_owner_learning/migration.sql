-- Owner-private derived insight. Empty shared-schema tables in tenant databases
-- are expected; the application persists only through the main/control client.
CREATE TABLE "OwnerLearningRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "version" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "failureCode" TEXT,
    "summary" JSONB,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OwnerLearningRun_state_check" CHECK ("state" IN ('PENDING','RUNNING','COMPLETE','FAILED')),
    CONSTRAINT "OwnerLearningRun_window_check" CHECK ("windowStart" < "windowEnd"),
    CONSTRAINT "OwnerLearningRun_summary_size_check" CHECK ("summary" IS NULL OR octet_length("summary"::text) <= 1048576)
);
CREATE UNIQUE INDEX "OwnerLearningRun_tenantId_ownerId_day_version_policyVersion_key" ON "OwnerLearningRun"("tenantId", "ownerId", "day", "version", "policyVersion");
CREATE INDEX "OwnerLearningRun_ownerId_tenantId_day_idx" ON "OwnerLearningRun"("ownerId", "tenantId", "day");
CREATE INDEX "OwnerLearningRun_expiresAt_idx" ON "OwnerLearningRun"("expiresAt");
