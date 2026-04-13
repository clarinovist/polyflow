-- DropForeignKey
ALTER TABLE "MaterialIssue" DROP CONSTRAINT "MaterialIssue_productionOrderId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionShift" DROP CONSTRAINT "ProductionShift_productionOrderId_fkey";

-- DropForeignKey
ALTER TABLE "QualityInspection" DROP CONSTRAINT "QualityInspection_productionOrderId_fkey";

-- DropForeignKey
ALTER TABLE "ScrapRecord" DROP CONSTRAINT "ScrapRecord_productionOrderId_fkey";

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionShift" ADD CONSTRAINT "ProductionShift_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityInspection" ADD CONSTRAINT "QualityInspection_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapRecord" ADD CONSTRAINT "ScrapRecord_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;