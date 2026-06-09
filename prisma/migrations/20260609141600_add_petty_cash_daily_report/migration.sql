-- AlterTable
ALTER TABLE "PettyCashTransaction" ADD COLUMN     "pettyCashDailyReportId" TEXT;

-- CreateTable
CREATE TABLE "PettyCashDailyReport" (
    "id" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "openingBalance" DECIMAL(15,2) NOT NULL,
    "totalIn" DECIMAL(15,2) NOT NULL,
    "totalOut" DECIMAL(15,2) NOT NULL,
    "closingBalance" DECIMAL(15,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "signedDocumentUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "readyToPrintById" TEXT,
    "physicalSignedConfirmedById" TEXT,
    "finalizedById" TEXT,
    "readyToPrintAt" TIMESTAMP(3),
    "physicalSignedConfirmedAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashDailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashDailyReport_reportDate_key" ON "PettyCashDailyReport"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashDailyReport_reportNumber_key" ON "PettyCashDailyReport"("reportNumber");

-- CreateIndex
CREATE INDEX "PettyCashDailyReport_reportDate_idx" ON "PettyCashDailyReport"("reportDate");

-- CreateIndex
CREATE INDEX "PettyCashDailyReport_status_reportDate_idx" ON "PettyCashDailyReport"("status", "reportDate");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_pettyCashDailyReportId_idx" ON "PettyCashTransaction"("pettyCashDailyReportId");

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_pettyCashDailyReportId_fkey" FOREIGN KEY ("pettyCashDailyReportId") REFERENCES "PettyCashDailyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashDailyReport" ADD CONSTRAINT "PettyCashDailyReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashDailyReport" ADD CONSTRAINT "PettyCashDailyReport_readyToPrintById_fkey" FOREIGN KEY ("readyToPrintById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashDailyReport" ADD CONSTRAINT "PettyCashDailyReport_physicalSignedConfirmedById_fkey" FOREIGN KEY ("physicalSignedConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashDailyReport" ADD CONSTRAINT "PettyCashDailyReport_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
