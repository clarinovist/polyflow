-- AlterTable
ALTER TABLE "MaterialIssue" ADD COLUMN     "batchId" TEXT;

-- AlterTable
ALTER TABLE "ProductionExecution" ALTER COLUMN "endTime" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
