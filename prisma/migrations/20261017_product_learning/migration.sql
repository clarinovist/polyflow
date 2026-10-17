-- Additive platform learning store. Tenant databases receive empty tables;
-- application access is exclusively getMainPrisma(). No historical data copy.
CREATE TABLE "LearningDailyRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "day" DATE NOT NULL,
  "version" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "failureCode" TEXT,
  "completedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningDailyRun_status_check" CHECK ("status" IN ('PENDING','RUNNING','COMPLETE','FAILED')),
  CONSTRAINT "LearningDailyRun_window_check" CHECK ("windowStart" < "windowEnd")
);
CREATE UNIQUE INDEX "LearningDailyRun_day_version_key" ON "LearningDailyRun"("day", "version");
CREATE INDEX "LearningDailyRun_expiresAt_idx" ON "LearningDailyRun"("expiresAt");
CREATE TABLE "LearningObservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "numerator" INTEGER NOT NULL,
  "denominator" INTEGER NOT NULL,
  "state" TEXT NOT NULL,
  CONSTRAINT "LearningObservation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "LearningDailyRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningObservation_counts_check" CHECK ("numerator" >= 0 AND "denominator" >= "numerator"),
  CONSTRAINT "LearningObservation_state_check" CHECK ("state" IN ('NO_DATA','INSUFFICIENT','OBSERVED'))
);
CREATE UNIQUE INDEX "LearningObservation_runId_metricKey_key" ON "LearningObservation"("runId", "metricKey");
CREATE TABLE "LearningFinding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fingerprint" TEXT NOT NULL,
  "domain" TEXT NOT NULL DEFAULT 'PRODUCT',
  "metricKey" TEXT NOT NULL,
  "ruleVersion" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "firstSeenDay" DATE NOT NULL,
  "lastSeenDay" DATE NOT NULL,
  "occurrences" INTEGER NOT NULL DEFAULT 1,
  "latestNumerator" INTEGER NOT NULL,
  "latestDenominator" INTEGER NOT NULL,
  "releaseRef" TEXT,
  "verificationRef" TEXT,
  "interventionAt" TIMESTAMP(3),
  "baselineStart" TIMESTAMP(3),
  "baselineEnd" TIMESTAMP(3),
  "baselineNumerator" INTEGER,
  "baselineDenominator" INTEGER,
  "baselineComplete" BOOLEAN NOT NULL DEFAULT false,
  "evaluationStart" TIMESTAMP(3),
  "evaluationEnd" TIMESTAMP(3),
  "evaluationResult" TEXT,
  "evaluationNumerator" INTEGER,
  "evaluationDenominator" INTEGER,
  "evaluatedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningFinding_domain_check" CHECK ("domain" = 'PRODUCT'),
  CONSTRAINT "LearningFinding_status_check" CHECK ("status" IN ('OPEN','ACCEPTED','REJECTED','MONITORING','EVALUATED')),
  CONSTRAINT "LearningFinding_counts_check" CHECK ("latestNumerator" >= 0 AND "latestDenominator" >= "latestNumerator")
);
CREATE UNIQUE INDEX "LearningFinding_fingerprint_key" ON "LearningFinding"("fingerprint");
CREATE INDEX "LearningFinding_status_evaluationEnd_idx" ON "LearningFinding"("status", "evaluationEnd");
CREATE INDEX "LearningFinding_expiresAt_idx" ON "LearningFinding"("expiresAt");
