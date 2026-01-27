-- AlterTable
ALTER TABLE "ProductionExecution" ADD COLUMN     "scrapDaunQty" DECIMAL(15,4) NOT NULL DEFAULT 0,
ADD COLUMN     "scrapProngkolQty" DECIMAL(15,4) NOT NULL DEFAULT 0;
