-- AlterTable: Add revenueAccountId to ProductVariant (tenant DB migration)
-- Run on each tenant DB via migrate-all-tenants

ALTER TABLE "ProductVariant" ADD COLUMN "revenueAccountId" TEXT;
