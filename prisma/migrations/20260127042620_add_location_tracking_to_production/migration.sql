-- AlterTable
ALTER TABLE "MaterialIssue" ADD COLUMN     "locationId" TEXT;

-- AlterTable
ALTER TABLE "ScrapRecord" ADD COLUMN     "locationId" TEXT;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapRecord" ADD CONSTRAINT "ScrapRecord_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
