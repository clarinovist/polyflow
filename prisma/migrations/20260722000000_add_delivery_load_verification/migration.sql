-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN "loadingStartedAt" TIMESTAMP(3),
ADD COLUMN "loadingStartedById" TEXT,
ADD COLUMN "loadVerifiedAt" TIMESTAMP(3),
ADD COLUMN "loadVerifiedById" TEXT,
ADD COLUMN "stockCommittedAt" TIMESTAMP(3),
ADD COLUMN "stockCommittedById" TEXT;

-- AlterTable
ALTER TABLE "DeliveryOrderItem" ADD COLUMN "verifiedQuantity" DECIMAL(15,4),
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "verifiedById" TEXT;
