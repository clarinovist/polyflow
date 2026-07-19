-- Add cached observability stats columns to Tenant.
-- All nullable: existing rows have no cache yet; refreshed on first stats run.
ALTER TABLE "Tenant" ADD COLUMN "cachedUserCount" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN "cachedActiveUserCount" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN "cachedDbSizeBytes" BIGINT;
ALTER TABLE "Tenant" ADD COLUMN "cachedLastActivityAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "cachedOnline" BOOLEAN;
ALTER TABLE "Tenant" ADD COLUMN "cachedStatsError" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "cachedStatsAt" TIMESTAMP(3);
