-- AlterTable: Add returnAccountId to ProductVariant (tenant DB migration)

ALTER TABLE "ProductVariant" ADD COLUMN "returnAccountId" TEXT;
