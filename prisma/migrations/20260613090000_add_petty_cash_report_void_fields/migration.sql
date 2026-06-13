-- AlterTable
ALTER TABLE "PettyCashDailyReport" ADD COLUMN "voidedById" TEXT;
ALTER TABLE "PettyCashDailyReport" ADD COLUMN "voidedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "PettyCashDailyReport" ADD CONSTRAINT "PettyCashDailyReport_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
