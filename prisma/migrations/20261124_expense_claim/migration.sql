-- Additive: klaim reimburse nota sales (ExpenseClaim) + enum status/kategori + nilai
-- ReferenceType EXPENSE_CLAIM untuk jurnal pencairan. Tabel baru kosong, tanpa backfill,
-- tanpa perubahan pada tabel lama. Nilai enum baru tidak dipakai di file ini.
-- Plan: docs/plan/2026-11-24-sales-tujuan-kunjungan-dan-klaim-reimburse.md (Fase 2)

-- CreateEnum
CREATE TYPE "ExpenseClaimCategory" AS ENUM ('BBM', 'PARKIR', 'TOL', 'MAKAN', 'TRANSPORT_LAIN', 'LAINNYA');

-- CreateEnum
CREATE TYPE "ExpenseClaimStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- AlterEnum
ALTER TYPE "ReferenceType" ADD VALUE 'EXPENSE_CLAIM';

-- CreateTable
CREATE TABLE "ExpenseClaim" (
    "id" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "salesVisitId" TEXT,
    "expenseDate" TIMESTAMP(3) NOT NULL,
    "category" "ExpenseClaimCategory" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT NOT NULL,
    "receiptUrl" TEXT NOT NULL,
    "clientClaimId" TEXT,
    "status" "ExpenseClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "paidById" TEXT,
    "paidAt" TIMESTAMP(3),
    "expenseAccountId" TEXT,
    "paymentAccountId" TEXT,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseClaim_claimNumber_key" ON "ExpenseClaim"("claimNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseClaim_journalEntryId_key" ON "ExpenseClaim"("journalEntryId");

-- CreateIndex
CREATE INDEX "ExpenseClaim_status_createdAt_idx" ON "ExpenseClaim"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ExpenseClaim_userId_createdAt_idx" ON "ExpenseClaim"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpenseClaim_salesVisitId_idx" ON "ExpenseClaim"("salesVisitId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseClaim_userId_clientClaimId_key" ON "ExpenseClaim"("userId", "clientClaimId");

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_salesVisitId_fkey" FOREIGN KEY ("salesVisitId") REFERENCES "SalesVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseClaim" ADD CONSTRAINT "ExpenseClaim_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
