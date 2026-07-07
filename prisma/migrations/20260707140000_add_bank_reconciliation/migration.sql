-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('MATCHED', 'UNMATCHED_BANK_ONLY', 'UNMATCHED_GL_ONLY', 'MANUALLY_MATCHED');

-- CreateEnum
CREATE TYPE "AdjustmentSide" AS ENUM ('BANK', 'BOOK');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('DEPOSIT_IN_TRANSIT', 'OUTSTANDING_CHECK', 'BANK_FEE', 'INTEREST_INCOME', 'NSF_CHECK', 'COLLECTION', 'CORRECTION_ADD', 'CORRECTION_SUBTRACT', 'OTHER');

-- AlterEnum
ALTER TYPE "ReferenceType" ADD VALUE 'BANK_RECONCILIATION';

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "bankBalance" DECIMAL(15,2) NOT NULL,
    "bookBalance" DECIMAL(15,2) NOT NULL,
    "adjustedBankBalance" DECIMAL(15,2),
    "adjustedBookBalance" DECIMAL(15,2),
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliationItem" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "bankDate" TIMESTAMP(3),
    "bankDescription" TEXT,
    "bankAmount" DECIMAL(15,2),
    "bankRef" TEXT,
    "journalLineId" TEXT,
    "glDate" TIMESTAMP(3),
    "glDescription" TEXT,
    "glDebit" DECIMAL(15,2),
    "glCredit" DECIMAL(15,2),
    "matchStatus" "MatchStatus" NOT NULL DEFAULT 'UNMATCHED_BANK_ONLY',
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "matchedBy" TEXT,
    "matchedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "BankReconciliationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliationAdjustment" (
    "id" TEXT NOT NULL,
    "reconciliationId" TEXT NOT NULL,
    "side" "AdjustmentSide" NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReconciliationAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankReconciliation_accountId_idx" ON "BankReconciliation"("accountId");

-- CreateIndex
CREATE INDEX "BankReconciliation_periodStart_periodEnd_idx" ON "BankReconciliation"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "BankReconciliation_status_idx" ON "BankReconciliation"("status");

-- CreateIndex
CREATE INDEX "BankReconciliationItem_reconciliationId_idx" ON "BankReconciliationItem"("reconciliationId");

-- CreateIndex
CREATE INDEX "BankReconciliationItem_journalLineId_idx" ON "BankReconciliationItem"("journalLineId");

-- CreateIndex
CREATE INDEX "BankReconciliationItem_matchStatus_idx" ON "BankReconciliationItem"("matchStatus");

-- CreateIndex
CREATE INDEX "BankReconciliationAdjustment_reconciliationId_idx" ON "BankReconciliationAdjustment"("reconciliationId");

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationItem" ADD CONSTRAINT "BankReconciliationItem_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationItem" ADD CONSTRAINT "BankReconciliationItem_journalLineId_fkey" FOREIGN KEY ("journalLineId") REFERENCES "JournalLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationAdjustment" ADD CONSTRAINT "BankReconciliationAdjustment_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationAdjustment" ADD CONSTRAINT "BankReconciliationAdjustment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
