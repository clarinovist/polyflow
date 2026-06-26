-- AlterTable
ALTER TABLE "JournalLine" ADD COLUMN "reconciledAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "JournalLine_accountId_reconciledAt_idx" ON "JournalLine"("accountId", "reconciledAt");
