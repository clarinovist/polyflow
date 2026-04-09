-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('INTERNAL', 'CUSTOMER_OWNED');

-- CreateEnum
CREATE TYPE "MaklonCostType" AS ENUM ('LABOR', 'MACHINE', 'ELECTRICITY', 'ADDITIVE', 'COLORANT', 'OVERHEAD', 'OTHER');

-- CreateEnum
CREATE TYPE "MaklonMaterialReturnStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "BomCategory" ADD VALUE 'REWORK';

-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'SERVICE';

-- AlterEnum
ALTER TYPE "ReferenceType" ADD VALUE 'PETTY_CASH';

-- AlterEnum
ALTER TYPE "SalesOrderType" ADD VALUE 'MAKLON_JASA';

-- DropForeignKey
ALTER TABLE "GoodsReceipt" DROP CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey";

-- AlterTable
ALTER TABLE "GoodsReceipt" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "isMaklon" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "purchaseOrderId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "locationType" "LocationType" NOT NULL DEFAULT 'INTERNAL';

-- AlterTable
ALTER TABLE "ProductionExecution" ADD COLUMN     "bobin" DECIMAL(15,4),
ADD COLUMN     "bruto" DECIMAL(15,4),
ADD COLUMN     "cekGram" TEXT;

-- AlterTable
ALTER TABLE "ProductionOrder" ADD COLUMN     "isMaklon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maklonCustomerId" TEXT;

-- AlterTable
ALTER TABLE "ScrapRecord" ADD COLUMN     "productionExecutionId" TEXT;

-- CreateTable
CREATE TABLE "PettyCashTransaction" (
    "id" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'EXPENSE',
    "expenseAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "journalEntryId" TEXT,
    "receiptUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PettyCashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaklonCostItem" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "costType" "MaklonCostType" NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaklonCostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaklonMaterialReturn" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceLocationId" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MaklonMaterialReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaklonMaterialReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaklonMaterialReturnItem" (
    "id" TEXT NOT NULL,
    "maklonMaterialReturnId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(15,4) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaklonMaterialReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ExecutionHelpers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashTransaction_voucherNumber_key" ON "PettyCashTransaction"("voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PettyCashTransaction_journalEntryId_key" ON "PettyCashTransaction"("journalEntryId");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_createdById_idx" ON "PettyCashTransaction"("createdById");

-- CreateIndex
CREATE INDEX "PettyCashTransaction_status_date_idx" ON "PettyCashTransaction"("status", "date");

-- CreateIndex
CREATE INDEX "MaklonCostItem_productionOrderId_idx" ON "MaklonCostItem"("productionOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "MaklonMaterialReturn_returnNumber_key" ON "MaklonMaterialReturn"("returnNumber");

-- CreateIndex
CREATE INDEX "MaklonMaterialReturn_customerId_idx" ON "MaklonMaterialReturn"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "_ExecutionHelpers_AB_unique" ON "_ExecutionHelpers"("A", "B");

-- CreateIndex
CREATE INDEX "_ExecutionHelpers_B_index" ON "_ExecutionHelpers"("B");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "JournalEntry_status_entryDate_idx" ON "JournalEntry"("status", "entryDate");

-- CreateIndex
CREATE INDEX "ProductionExecution_startTime_idx" ON "ProductionExecution"("startTime");

-- CreateIndex
CREATE INDEX "ProductionOrder_actualEndDate_idx" ON "ProductionOrder"("actualEndDate");

-- CreateIndex
CREATE INDEX "ProductionOrder_updatedAt_status_idx" ON "ProductionOrder"("updatedAt", "status");

-- CreateIndex
CREATE INDEX "QualityInspection_inspectedAt_idx" ON "QualityInspection"("inspectedAt");

-- CreateIndex
CREATE INDEX "SalesOrder_orderDate_idx" ON "SalesOrder"("orderDate");

-- CreateIndex
CREATE INDEX "ScrapRecord_recordedAt_idx" ON "ScrapRecord"("recordedAt");

-- CreateIndex
CREATE INDEX "ScrapRecord_productionExecutionId_idx" ON "ScrapRecord"("productionExecutionId");

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_maklonCustomerId_fkey" FOREIGN KEY ("maklonCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapRecord" ADD CONSTRAINT "ScrapRecord_productionExecutionId_fkey" FOREIGN KEY ("productionExecutionId") REFERENCES "ProductionExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "PettyCashTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaklonCostItem" ADD CONSTRAINT "MaklonCostItem_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaklonMaterialReturn" ADD CONSTRAINT "MaklonMaterialReturn_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaklonMaterialReturn" ADD CONSTRAINT "MaklonMaterialReturn_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaklonMaterialReturn" ADD CONSTRAINT "MaklonMaterialReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaklonMaterialReturnItem" ADD CONSTRAINT "MaklonMaterialReturnItem_maklonMaterialReturnId_fkey" FOREIGN KEY ("maklonMaterialReturnId") REFERENCES "MaklonMaterialReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaklonMaterialReturnItem" ADD CONSTRAINT "MaklonMaterialReturnItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExecutionHelpers" ADD CONSTRAINT "_ExecutionHelpers_A_fkey" FOREIGN KEY ("A") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ExecutionHelpers" ADD CONSTRAINT "_ExecutionHelpers_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductionExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

